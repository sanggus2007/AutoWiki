import inspect
from langchain_githubcopilot_chat import auth
with open('source.txt', 'w', encoding='utf-8') as f:
    f.write(inspect.getsource(auth))
