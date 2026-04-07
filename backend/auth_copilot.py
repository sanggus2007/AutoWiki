from langchain_githubcopilot_chat import get_vscode_token

def main():
    print("\n" + "="*50)
    print(" GitHub Copilot Authenticator for AutoWiki AI")
    print("="*50 + "\n")
    print("This script uses your local GitHub Copilot subscription to bypass API limits.")
    print("Please follow the instructions below. A browser window may open automatically.\n")
    
    def on_message(msg):
        print(f"[Copilot Auth] {msg}")
        
    try:
        # Request interactive auth code + token
        token = get_vscode_token(callback=on_message)
        
        print("\n" + "="*50)
        print(" AUTHENTICATION SUCCESSFUL! 🎉")
        print("="*50)
        print(f"\nYOUR COPILOT TOKEN:\n\n{token}\n")
        print("="*50)
        print("Instructions:")
        print("1. Go to your AutoWiki AI Settings dropdown in the browser UI.")
        print("2. Paste this entire token into the 'AutoWiki AI API Key' input field.")
        print("3. The Planner and Executor agents will now use GPT-4o for free.")
        print("\n" + "="*50)
    except Exception as e:
        print(f"\n[Error] Authentication failed: {e}")

if __name__ == "__main__":
    main()
