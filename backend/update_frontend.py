import os
import re

FRONTEND_FILE = r'd:\AntigravityProject\AutoWiki\frontend\src\app\dashboard\settings\page.tsx'

with open(FRONTEND_FILE, 'r', encoding='utf-8') as f:
    code = f.read()

# 1. Update imports and state
state_search = '''export default function SettingsPage() {
  const [model, setModel] = useState("gemini-1.5-pro");
  const [apiKey, setApiKey] = useState("");
  const [saved, setSaved] = useState(false);'''

state_replace = '''export default function SettingsPage() {
  const [model, setModel] = useState("gemini-1.5-pro");
  const [apiKey, setApiKey] = useState("");
  const [saved, setSaved] = useState(false);
  const [prompts, setPrompts] = useState<{key: string, name: string, content: string, description: string}[]>([]);
  const [promptsLoading, setPromptsLoading] = useState(true);
  const [promptsSaved, setPromptsSaved] = useState(false);'''
code = code.replace(state_search, state_replace)

# 2. Update useEffect
effect_search = '''  useEffect(() => {
    // Load existing settings
    const savedModel = localStorage.getItem("autowiki_llm_model");
    const savedKey = localStorage.getItem("autowiki_llm_api_key");
    if (savedModel) setModel(savedModel);
    if (savedKey) setApiKey(savedKey);
  }, []);'''

effect_replace = '''  useEffect(() => {
    // Load existing settings
    const savedModel = localStorage.getItem("autowiki_llm_model");
    const savedKey = localStorage.getItem("autowiki_llm_api_key");
    if (savedModel) setModel(savedModel);
    if (savedKey) setApiKey(savedKey);
    
    // Load prompts
    const fetchPrompts = async () => {
      try {
        const res = await fetch("http://localhost:8000/api/prompts");
        if (res.ok) {
          const data = await res.json();
          setPrompts(data);
        }
      } catch (err) {
        console.error("Failed to load prompts", err);
      } finally {
        setPromptsLoading(false);
      }
    };
    fetchPrompts();
  }, []);'''
code = code.replace(effect_search, effect_replace)

# 3. Add prompt save handler
prompts_handlers = '''  const handlePromptChange = (key: string, newContent: string) => {
    setPrompts(prev => prev.map(p => p.key === key ? { ...p, content: newContent } : p));
  };

  const handlePromptsSave = async () => {
    try {
      for (const p of prompts) {
        await fetch(`http://localhost:8000/api/prompts/${p.key}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ content: p.content })
        });
      }
      setPromptsSaved(true);
      setTimeout(() => setPromptsSaved(false), 3000);
    } catch (err) {
      console.error("Failed to save prompts", err);
    }
  };'''

code = code.replace('  const handleSave = () => {', prompts_handlers + '\n\n  const handleSave = () => {')

# 4. Integrate UI below LLM config Box
# The file ends with:
#         </div>
#       </div>
#     </div>
#   );
# }
ui_jsx = '''        </div>
      </div>

      {/* System Prompts Configuration */}
      <div className="bg-[#f8f9fa] border border-[#a2a9b1] rounded-sm p-6 max-w-2xl mt-6">
        <h2 className="text-xl font-bold border-b border-[#a2a9b1] pb-2 mb-5 flex items-center">
          <Bot className="mr-2 text-[#54595d]" size={20} />
          시스템 프롬프트 (System Prompts)
        </h2>
        
        {promptsLoading ? (
          <div className="text-sm text-[#54595d] py-4 text-center">프롬프트 데이터를 불러오는 중...</div>
        ) : (
          <div className="space-y-6">
            {prompts.map((prompt) => (
              <div key={prompt.key}>
                <label className="block text-sm font-bold mb-1">
                  {prompt.name}
                </label>
                <p className="text-[#54595d] text-xs mb-2">{prompt.description}</p>
                <textarea
                  value={prompt.content}
                  onChange={(e) => handlePromptChange(prompt.key, e.target.value)}
                  className="w-full bg-white border border-[#a2a9b1] text-[#202122] rounded-sm px-3 py-2 cursor-text focus:outline-none focus:border-[#0645ad] transition-all font-mono text-[13px] shadow-inner font-mono h-64 resize-y"
                  spellCheck="false"
                />
              </div>
            ))}

            <div className="pt-4 border-t border-[#a2a9b1] flex items-center justify-between">
              {promptsSaved ? (
                <motion.div 
                  initial={{ opacity: 0, x: -10 }} 
                  animate={{ opacity: 1, x: 0 }} 
                  className="flex items-center text-[#00af89] text-sm font-bold"
                >
                  <CheckCircle2 size={16} className="mr-1.5" /> 저장되었습니다
                </motion.div>
              ) : (
                <div></div>
              )}
              
              <button
                onClick={handlePromptsSave}
                className="bg-[#0645ad] hover:bg-[#0b0080] text-white font-bold px-4 py-2 rounded-sm flex items-center transition-colors"
              >
                <Save size={16} className="mr-2" /> 프롬프트 저장하기
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}'''

code = code.replace('''        </div>
      </div>
    </div>
  );
}''', ui_jsx)

with open(FRONTEND_FILE, 'w', encoding='utf-8') as f:
    f.write(code)
print("Updated frontend page.tsx")
