sap.ui.define([
    "sap/ui/core/UIComponent",
    "sap/m/MessageToast"
], function (UIComponent, MessageToast) {
    "use strict";

    // localStorage 存储键名
    var STORAGE_KEY = "ai_chat_conversations";
    // 最大存储对话数量（防止 localStorage 溢出）
    var MAX_CONVERSATIONS = 100;

    return UIComponent.extend("com.ai.assistant.aichatapp.Component", {
        metadata: {
            manifest: "json"
        },
        
        // 全局对话列表（包含所有 AI 类型的对话）
        _aAllConversations: [],

        init: function () {
            // 调用父类初始化
            UIComponent.prototype.init.apply(this, arguments);

            // 初始化路由
            this.getRouter().initialize();

            // 从 localStorage 加载历史对话
            this._loadConversationsFromStorage();
        },

        // 从 localStorage 读取并恢复历史对话
        _loadConversationsFromStorage: function () {
            try {
                var sStoredData = localStorage.getItem(STORAGE_KEY);
                
                if (sStoredData) {
                    var aConversations = JSON.parse(sStoredData);
                    // 验证数据格式
                    if (Array.isArray(aConversations)) {
                        // 兼容旧数据：为缺失 aiType 的会话补默认值
                        aConversations = aConversations.map(function (conv) {
                            if (!conv.aiType) {
                                conv.aiType = "abap-clean-core";  // 默认 AI 类型
                            }
                            if (!Array.isArray(conv.attachments)) {
                                conv.attachments = [];
                            }
                            if (typeof conv.isPinned !== "boolean") {
                                conv.isPinned = false;
                            }
                            return conv;
                        });
                        // 保存到全局对话列表
                        this._aAllConversations = aConversations;
                    }
                }
            } catch {
                // 存储数据损坏时，清空并重置
                try {
                    localStorage.removeItem(STORAGE_KEY);
                } catch {
                    // 忽略清除错误
                }
            }
        },

        _sanitizeConversationsForStorage: function (aConversations) {
            return (aConversations || []).map(function (conv) {
                var oCopy = Object.assign({}, conv);
                if (Array.isArray(conv.attachments)) {
                    oCopy.attachments = conv.attachments.map(function (att) {
                        var oAtt = Object.assign({}, att);
                        if (oAtt.file) {
                            delete oAtt.file;
                        }
                        return oAtt;
                    });
                }
                return oCopy;
            });
        },


        // 将对话持久化到 localStorage
        saveConversationsToStorage: function () {
            var aAllConversations = this._aAllConversations || [];
            
            try {
                // 限制持久化数量，防止 localStorage 空间耗尽
                if (aAllConversations.length > MAX_CONVERSATIONS) {
                    aAllConversations = aAllConversations.slice(0, MAX_CONVERSATIONS);
                    this._aAllConversations = aAllConversations;
                }
                
                var aStoredConversations = this._sanitizeConversationsForStorage(aAllConversations);
                localStorage.setItem(STORAGE_KEY, JSON.stringify(aStoredConversations));
            } catch (e) {
                // 判断是否为存储空间不足错误
                if (e.name === 'QuotaExceededError' || e.code === 22) {
                    // 自动裁剪旧会话后重试一次
                    if (aAllConversations.length > 1) {
                        aAllConversations = aAllConversations.slice(0, Math.floor(aAllConversations.length / 2));
                        this._aAllConversations = aAllConversations;
                        
                        try {
                            aStoredConversations = this._sanitizeConversationsForStorage(aAllConversations);
                            localStorage.setItem(STORAGE_KEY, JSON.stringify(aStoredConversations));
                            MessageToast.show("存储空间不足，已自动清理部分历史对话");
                        } catch {
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
