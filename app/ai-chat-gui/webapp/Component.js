sap.ui.define([
    "sap/ui/core/UIComponent",
    "sap/m/MessageToast"
], function (UIComponent, MessageToast) {
    "use strict";

    // localStorage存储键名
    var STORAGE_KEY = "ai_chat_conversations";
    // 最大存储对话数量（防止localStorage溢出）
    var MAX_CONVERSATIONS = 100;

    return UIComponent.extend("com.ai.assistant.aichatapp.Component", {
        metadata: {
            manifest: "json"
        },
        
        // 全局对话列表（包含所有AI类型的对话）
        _aAllConversations: [],

        init: function () {
            // 调用父类初始化
            UIComponent.prototype.init.apply(this, arguments);

            // 初始化路由
            this.getRouter().initialize();

            // 从localStorage加载历史对话
            this._loadConversationsFromStorage();
        },

        // 从localStorage加载对话历史
        _loadConversationsFromStorage: function () {
            try {
                var sStoredData = localStorage.getItem(STORAGE_KEY);
                
                if (sStoredData) {
                    var aConversations = JSON.parse(sStoredData);
                    // 验证数据格式
                    if (Array.isArray(aConversations)) {
                        // 兼容旧数据：为没有aiType的对话添加默认值
                        aConversations = aConversations.map(function (conv) {
                            if (!conv.aiType) {
                                conv.aiType = "abap-clean-core";  // 默认AI类型
                            }
                            return conv;
                        });
                        // 保存到全局对话列表
                        this._aAllConversations = aConversations;
                    }
                }
            } catch (e) {
                // 如果数据损坏，清除并重置
                try {
                    localStorage.removeItem(STORAGE_KEY);
                } catch (removeError) {
                    // 忽略清除错误
                }
            }
        },

        // 保存对话到localStorage
        saveConversationsToStorage: function () {
            var aAllConversations = this._aAllConversations || [];
            
            try {
                // 限制存储的对话数量，防止localStorage溢出
                if (aAllConversations.length > MAX_CONVERSATIONS) {
                    aAllConversations = aAllConversations.slice(0, MAX_CONVERSATIONS);
                    this._aAllConversations = aAllConversations;
                }
                
                localStorage.setItem(STORAGE_KEY, JSON.stringify(aAllConversations));
            } catch (e) {
                // 检查是否为存储空间不足
                if (e.name === 'QuotaExceededError' || e.code === 22) {
                    // 尝试删除最旧的对话后重试
                    if (aAllConversations.length > 1) {
                        aAllConversations = aAllConversations.slice(0, Math.floor(aAllConversations.length / 2));
                        this._aAllConversations = aAllConversations;
                        
                        try {
                            localStorage.setItem(STORAGE_KEY, JSON.stringify(aAllConversations));
                            MessageToast.show("存储空间不足，已自动清理部分历史对话");
                        } catch (retryError) {
                            MessageToast.show("存储空间不足，无法保存对话历史");
                        }
                    } else {
                        MessageToast.show("存储空间不足，无法保存对话历史");
                    }
                }
            }
        }
    });
});
