import os
from flask import Flask, request, jsonify, render_template
from werkzeug.utils import secure_filename
from langchain_community.document_loaders import PyPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_google_genai import GoogleGenerativeAIEmbeddings, ChatGoogleGenerativeAI
from langchain_community.vectorstores import FAISS
try:
    from langchain.chains import RetrievalQA
except ImportError:
    from langchain_classic.chains import RetrievalQA
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = 'uploads'
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max limit

# Ensure upload directory exists
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

# Global variable to store the vector store temporarily (for demo purposes)
# In production, you'd want to persist this or manage it per session/user
vector_store = None
api_key = None

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/set_api_key', methods=['POST'])
def set_api_key():
    global api_key
    data = request.json
    api_key = data.get('api_key')
    if not api_key:
        return jsonify({'error': 'API key is required'}), 400
    
    # Simple validation (not comprehensive)
    # Simple validation for Gemini Key
    if not api_key: # Relaxed validation
         return jsonify({'error': 'Invalid API key format'}), 400
    
    # DEBUG: Check available models
    try:
        import google.generativeai as genai
        genai.configure(api_key=api_key)
        models = list(genai.list_models())
        model_names = [m.name for m in models]
        print("Available Models:", model_names)
        
        if 'models/gemini-1.5-flash' not in model_names and 'models/gemini-pro' not in model_names:
            print("Warning: Standard models not found in:", model_names)
            
        return jsonify({'message': 'API key set successfully', 'models': model_names})
            
    except Exception as e:
        print("Model check failed:", e)
        return jsonify({'message': 'API key set (validation skipped)', 'error': str(e)})

@app.route('/upload', methods=['POST'])
def upload_file():
    global vector_store, api_key
    
    if not api_key:
        return jsonify({'error': 'API Key not set. Please set it first.'}), 401
        
    if 'file' not in request.files:
        return jsonify({'error': 'No file part'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400
        
    if file and file.filename.endswith('.pdf'):
        filename = secure_filename(file.filename)
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(filepath)
        
        try:
            # Process PDF
            loader = PyPDFLoader(filepath)
            documents = loader.load()
            
            text_splitter = RecursiveCharacterTextSplitter(
                chunk_size=1000,
                chunk_overlap=200
            )
            texts = text_splitter.split_documents(documents)
            
            # Create Embeddings (Gemini) - Using text-embedding-004 for better efficiency
            embeddings = GoogleGenerativeAIEmbeddings(model="models/text-embedding-004", google_api_key=api_key)
            vector_store = FAISS.from_documents(texts, embeddings)
            
            return jsonify({'message': 'File processed successfully. You can now ask questions.'})
            
        except Exception as e:
            import traceback
            traceback.print_exc()
            return jsonify({'error': str(e)}), 500
        finally:
            # Clean up uploaded file to save space
            if os.path.exists(filepath):
                os.remove(filepath)
    else:
        return jsonify({'error': 'Invalid file type. Only PDF allowed.'}), 400

@app.route('/ask', methods=['POST'])
def ask_question():
    global vector_store, api_key
    
    if not api_key:
        return jsonify({'error': 'API Key not set'}), 401
        
    if not vector_store:
        return jsonify({'error': 'No document processed. Please upload a PDF first.'}), 400
        
    data = request.json
    question = data.get('question')
    
    if not question:
        return jsonify({'error': 'Question is required'}), 400
        
    try:
        # Use Gemini 2.5 Flash (From user list, likely freshest quota)
        llm = ChatGoogleGenerativeAI(model="gemini-2.5-flash", google_api_key=api_key, temperature=0, convert_system_message_to_human=True)
        
        qa_chain = RetrievalQA.from_chain_type(
            llm=llm,
            chain_type="stuff",
            retriever=vector_store.as_retriever()
        )
        
        # Custom retry loop for Rate Limits
        import time
        import google.api_core.exceptions
        
        max_retries = 3
        for attempt in range(max_retries):
            try:
                response = qa_chain.invoke(question)
                return jsonify({'answer': response['result']})
            except google.api_core.exceptions.ResourceExhausted as e:
                # Extract wait time from error or default to 35s
                wait_time = 35 
                print(f"Quota exceeded, waiting {wait_time}s... (Attempt {attempt+1})")
                if attempt < max_retries - 1:
                    time.sleep(wait_time) 
                else:
                    raise e
        
    except Exception as e:
        print("Ask error:", e)
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True)
