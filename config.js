// Boss Decoder 配置文件
// 请在此配置您的API密钥和Supabase信息

const CONFIG = {
    // 智能体API配置
    AI_AGENT: {
        // 智能体API的URL地址
        API_URL: 'https://open.bigmodel.cn/api/paas/v4/chat/completions', // 例如: 'https://api.example.com/v1/chat'
        // API密钥
        API_KEY: '9c339b5642d14feaa6b34bcf5278589f.kkYVc8qDTpyLDGtw', // 请在此填入您的API密钥
        // 请求超时时间（毫秒）
        TIMEOUT: 30000
    },

    // Supabase配置
    SUPABASE: {
        // Supabase项目URL
        PROJECT_URL: 'https://nvapgvtcdfaleplryrsz.supabase.co', // 例如: 'https://xxxxx.supabase.co'
        // Supabase公开密钥（publishable key）
        PUBLISHABLE_KEY: 'sb_publishable_HMecx-RdK1zUUH0zzvpXCA_IwxiiUtB' // 请在此填入您的publishable key
    },

    // 应用配置
    APP: {
        // 历史记录最大保存数量
        MAX_HISTORY: 20,
        // 是否启用Supabase（如果未配置，将使用本地存储）
        ENABLE_SUPABASE: false // 当配置了Supabase后，可设置为true启用
    }
};

// 检查配置是否完整
function checkConfig() {
    const warnings = [];
    
    if (!CONFIG.AI_AGENT.API_URL || !CONFIG.AI_AGENT.API_KEY) {
        warnings.push('智能体API未配置，将使用模拟数据');
    }
    
    if (CONFIG.APP.ENABLE_SUPABASE) {
        if (!CONFIG.SUPABASE.PROJECT_URL || !CONFIG.SUPABASE.PUBLISHABLE_KEY) {
            warnings.push('Supabase未正确配置，将使用本地存储');
            CONFIG.APP.ENABLE_SUPABASE = false;
        }
    }
    
    if (warnings.length > 0) {
        console.warn('配置警告:', warnings);
    }
    
    return warnings.length === 0;
}

// 初始化时检查配置
checkConfig();

