import sys
print(f"Python: {sys.version}")
try:
    import langchain
    print(f"LangChain: {langchain.__file__}")
    print(f"LangChain Version: {langchain.__version__}")
    import langchain.chains
    print("langchain.chains imported successfully")
except Exception as e:
    print(f"Error: {e}")

try:
    from langchain.chains import RetrievalQA
    print("RetrievalQA imported successfully")
except Exception as e:
    print(f"RetrievalQA Error: {e}")
