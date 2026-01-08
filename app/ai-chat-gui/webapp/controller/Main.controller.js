sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/m/MessageBox",
    "sap/m/MessageToast"
], function (Controller, MessageBox, MessageToast) {
    "use strict";

    // 文件上传配置
    var FILE_UPLOAD_CONFIG = {
        MAX_FILE_SIZE: 50 * 1024 * 1024,  // 50MB
        MAX_FILES_PER_SESSION: 5,
        ALLOWED_EXTENSIONS: ['.pdf', '.doc', '.docx', '.txt', '.md', '.json', '.xml', '.csv', '.xlsx', '.xls', '.ppt', '.pptx'],
        POLL_INTERVAL: 2000,              // 轮询间隔2秒
        MAX_POLL_ATTEMPTS: 60             // 最大轮询次数（2分钟）
    };

    // 文件类型与图标映射
    var FILE_TYPE_ICONS = {
        'pdf': { icon: '&#xe9c6;', class: 'pdf' },
        'doc': { icon: '&#xe9ca;', class: 'doc' },
        'docx': { icon: '&#xe9ca;', class: 'docx' },
        'xls': { icon: '&#xe9c9;', class: 'xls' },
        'xlsx': { icon: '&#xe9c9;', class: 'xlsx' },
        'ppt': { icon: '&#xe9c5;', class: 'ppt' },
        'pptx': { icon: '&#xe9c5;', class: 'pptx' },
        'txt': { icon: '&#xe9ce;', class: 'txt' },
        'md': { icon: '&#xe9ce;', class: 'md' },
        'json': { icon: '&#xe9ce;', class: 'json' },
        'xml': { icon: '&#xe9ce;', class: 'xml' },
        'csv': { icon: '&#xe9c9;', class: 'csv' },
        'default': { icon: '&#xe9c4;', class: 'default' }
    };

    return Controller.extend("com.ai.assistant.aichatapp.controller.Main", {

        onInit: function () {
            // 控制器初始化
            // 布局已在视图中设置为TwoColumnsMidExpanded

            // 监听路由匹配事件，获取AI类型参数
            var oRouter = this.getOwnerComponent().getRouter();
            oRouter.getRoute("chat").attachPatternMatched(this._onRouteMatched, this);
        },

        /**
         * 视图渲染完成后调用
         */
        onAfterRendering: function () {
            this._bindKeyboardShortcut();
            this._bindFileInputChange();
        },

        /**
         * 绑定键盘快捷键
         * Enter 发送消息，Shift+Enter 换行
         */
        _bindKeyboardShortcut: function () {
            // 防止重复绑定
            if (this._bKeyboardBound) {
                return;
            }

            var that = this;
            var oTextArea = this.byId("messageInput");

            if (oTextArea && oTextArea.getDomRef()) {
                var oDomRef = oTextArea.getDomRef();
                var oTextAreaElement = oDomRef.querySelector("textarea");

                if (oTextAreaElement) {
                    oTextAreaElement.addEventListener("keydown", function (oEvent) {
                        // Enter 发送消息（不按 Shift）
                        if (oEvent.key === "Enter" && !oEvent.shiftKey) {
                            oEvent.preventDefault();
                            oEvent.stopPropagation();
                            that.onSendMessage();
                        }
                        // Shift+Enter 换行（默认行为，不需要处理）
                    }, true);  // 使用捕获阶段
                    this._bKeyboardBound = true;
                }
            }
        },

        /**
         * 路由匹配时触发，获取AI类型并更新页面
         * @param {sap.ui.base.Event} oEvent 路由事件
         */
        _onRouteMatched: function (oEvent) {
            var sAiType = oEvent.getParameter("arguments").aiType;
            var oModel = this.getView().getModel("chat");
            var oI18n = this.getView().getModel("i18n").getResourceBundle();
            var sPreviousAiType = oModel.getProperty("/currentAiType");

            // 初始化附件数组（如果尚未初始化）
            if (!oModel.getProperty("/attachments")) {
                oModel.setProperty("/attachments", []);
            }

            // 保存当前AI类型
            oModel.setProperty("/currentAiType", sAiType);

            // 根据AI类型设置页面标题
            var sTitleKey = this._getAiTitleKey(sAiType);
            var sTitle = oI18n.getText(sTitleKey);
            oModel.setProperty("/currentAiTitle", sTitle);

            // 更新页面标题
            this.byId("chatPageTitle").setText(sTitle);

            // 更新欢迎信息（根据AI类型动态显示）
            this._updateWelcomeMessage(sAiType);

            // 如果切换了AI类型，重置当前对话状态
            if (sPreviousAiType && sPreviousAiType !== sAiType) {
                this._resetCurrentConversation();
            }

            // 过滤显示当前AI类型的对话历史
            this._filterConversationsByAiType(sAiType);
        },

        /**
         * 重置当前对话状态（切换AI类型时调用）
         */
        _resetCurrentConversation: function () {
            var oModel = this.getView().getModel("chat");

            // 清空当前对话ID和消息
            oModel.setProperty("/currentConversationId", null);
            oModel.setProperty("/messages", []);

            // 清空消息容器并显示欢迎框
            this._clearMessageContainer();
            this._showWelcomeBox();
        },

        /**
         * 根据AI类型过滤对话历史
         * @param {string} sAiType AI类型
         */
        _filterConversationsByAiType: function (sAiType) {
            var oModel = this.getView().getModel("chat");
            var aAllConversations = this.getOwnerComponent()._aAllConversations || [];

            // 过滤出当前AI类型的对话
            var aFilteredConversations = aAllConversations.filter(function (conv) {
                return conv.aiType === sAiType;
            });

            oModel.setProperty("/conversations", aFilteredConversations);
        },

        /**
         * 根据AI类型更新欢迎信息
         * @param {string} sAiType AI类型
         */
        _updateWelcomeMessage: function (sAiType) {
            var oI18n = this.getView().getModel("i18n").getResourceBundle();
            var oWelcomeBox = this.byId("welcomeBox");

            if (!oWelcomeBox) {
                return;
            }

            // 获取对应AI类型的欢迎标题和消息
            var sWelcomeTitleKey = "welcomeTitle_" + sAiType;
            var sWelcomeMessageKey = "welcomeMessage_" + sAiType;

            // 尝试获取特定AI类型的欢迎信息，如果没有则使用默认值
            var sWelcomeTitle = oI18n.getText(sWelcomeTitleKey);
            var sWelcomeMessage = oI18n.getText(sWelcomeMessageKey);

            // 如果返回的是key本身（说明没有找到对应翻译），使用默认值
            if (sWelcomeTitle === sWelcomeTitleKey) {
                sWelcomeTitle = oI18n.getText("welcomeTitle");
            }
            if (sWelcomeMessage === sWelcomeMessageKey) {
                sWelcomeMessage = oI18n.getText("welcomeMessage");
            }

            // 更新欢迎框中的标题和消息
            var aItems = oWelcomeBox.getItems();
            aItems.forEach(function (oItem) {
                if (oItem.isA("sap.m.Title")) {
                    oItem.setText(sWelcomeTitle);
                } else if (oItem.isA("sap.m.Text")) {
                    oItem.setText(sWelcomeMessage);
                }
            });
        },

        /**
         * 根据AI类型获取对应的i18n标题键
         * @param {string} sAiType AI类型
         * @returns {string} i18n键名
         */
        _getAiTitleKey: function (sAiType) {
            var oTitleMap = {
                "abap-clean-core": "abapCleanCoreTitle",
                "cpi": "cpiAiTitle",
                "func-doc": "funcDocAiTitle",
                "tech-doc": "techDocAiTitle",
                "code-review": "codeReviewTitle",
                "unit-test": "unitTestTitle"
            };
            return oTitleMap[sAiType] || "appTitle";
        },

        /**
         * 返回首页
         */
        onNavBack: function () {
            var oRouter = this.getOwnerComponent().getRouter();
            oRouter.navTo("home");
        },

        // 切换侧边栏显示/隐藏
        onToggleSidebar: function () {
            var oFlexibleColumnLayout = this.byId("flexibleColumnLayout");
            var sCurrentLayout = oFlexibleColumnLayout.getLayout();

            if (sCurrentLayout === "OneColumn" || sCurrentLayout === "MidColumnFullScreen") {
                // 显示侧边栏，聊天区域更宽
                oFlexibleColumnLayout.setLayout("TwoColumnsMidExpanded");
            } else {
                // 隐藏侧边栏，全屏聊天
                oFlexibleColumnLayout.setLayout("MidColumnFullScreen");
            }
        },

        // 新建对话
        onNewConversation: function () {
            var oModel = this.getView().getModel("chat");
            var oI18n = this.getView().getModel("i18n").getResourceBundle();
            var sCurrentAiType = oModel.getProperty("/currentAiType");

            // 创建新对话（包含AI类型和会话信息）
            var oNewConversation = {
                id: this._generateUUID(),
                title: oI18n.getText("newConversation"),
                messages: [],
                lastUpdate: this._formatDate(new Date()),
                sessionId: null,
                sessionInfo: null,  // 新对话时为null，首次收到sessionId时初始化
                aiType: sCurrentAiType  // 保存AI类型
            };

            // 添加到全局对话列表
            var aAllConversations = this.getOwnerComponent()._aAllConversations || [];
            aAllConversations.unshift(oNewConversation);
            this.getOwnerComponent()._aAllConversations = aAllConversations;

            // 更新当前显示的对话列表（已过滤）
            var aFilteredConversations = oModel.getProperty("/conversations") || [];
            aFilteredConversations.unshift(oNewConversation);
            oModel.setProperty("/conversations", aFilteredConversations);

            oModel.setProperty("/currentConversationId", oNewConversation.id);
            oModel.setProperty("/messages", []);

            // 清空消息容器并显示欢迎框
            this._clearMessageContainer();
            this._showWelcomeBox();

            // 保存到localStorage
            this.getOwnerComponent().saveConversationsToStorage();

            MessageToast.show(oI18n.getText("newConversationCreated"));
        },


        // 选择对话
        onConversationSelect: function (oEvent) {
            var oContext;
            var oSource = oEvent.getSource();

            // 处理不同的事件来源（List的selectionChange vs CustomListItem的press）
            if (oEvent.getParameter("listItem")) {
                // 来自List的selectionChange事件
                oContext = oEvent.getParameter("listItem").getBindingContext("chat");
            } else {
                // 来自CustomListItem的press事件
                oContext = oSource.getBindingContext("chat");
            }

            if (oContext) {
                var oConversation = oContext.getObject();
                var oModel = this.getView().getModel("chat");

                // 从conversations数组中找到完整的对话数据（包含messages）
                var aConversations = oModel.getProperty("/conversations") || [];
                var oFullConversation = aConversations.find(function (conv) {
                    return conv.id === oConversation.id;
                });

                if (oFullConversation) {
                    oModel.setProperty("/currentConversationId", oFullConversation.id);
                    // 深拷贝消息数组避免引用问题
                    var aMessages = JSON.parse(JSON.stringify(oFullConversation.messages || []));
                    oModel.setProperty("/messages", aMessages);

                    // 渲染消息
                    this._renderMessages();

                    // 根据消息数量显示/隐藏欢迎框
                    if (aMessages.length > 0) {
                        this._hideWelcomeBox();
                    } else {
                        this._showWelcomeBox();
                    }

                    // 滚动到底部
                    this._scrollToBottom();
                }
            }
        },

        // 编辑对话标题
        onEditConversationTitle: function (oEvent) {
            var that = this;
            var oSource = oEvent.getSource();
            var oContext = oSource.getBindingContext("chat");

            // 防止重复点击
            if (this._bEditDialogOpen) {
                return;
            }

            if (oContext) {
                var oConversation = oContext.getObject();
                var sPath = oContext.getPath();

                this._bEditDialogOpen = true;

                // 使用sap.ui.require异步加载，避免全局依赖
                var oI18n = this.getView().getModel("i18n").getResourceBundle();

                sap.ui.require(["sap/m/Dialog", "sap/m/Input", "sap/m/Button"], function (Dialog, Input, Button) {
                    // 创建输入控件
                    var oInput = new Input({
                        value: oConversation.title,
                        width: "100%",
                        placeholder: oI18n.getText("editTitle")
                    });

                    // 创建输入对话框
                    var oDialog = new Dialog({
                        title: oI18n.getText("editTitle"),
                        type: "Message",
                        content: [oInput],
                        beginButton: new Button({
                            text: oI18n.getText("ok"),
                            type: "Emphasized",
                            press: function () {
                                var sNewTitle = oInput.getValue();
                                if (sNewTitle.trim()) {
                                    var oModel = that.getView().getModel("chat");
                                    oModel.setProperty(sPath + "/title", sNewTitle.trim());
                                    that.getOwnerComponent().saveConversationsToStorage();
                                    MessageToast.show(oI18n.getText("titleUpdated"));
                                }
                                oDialog.close();
                            }
                        }),
                        endButton: new Button({
                            text: oI18n.getText("cancel"),
                            press: function () {
                                oDialog.close();
                            }
                        }),
                        afterClose: function () {
                            oDialog.destroy();
                            that._bEditDialogOpen = false;
                        }
                    });

                    oDialog.open();
                });
            }
        },

        // 删除对话
        onDeleteConversation: function (oEvent) {
            var that = this;
            var oSource = oEvent.getSource();
            var oContext = oSource.getBindingContext("chat");
            var oI18n = this.getView().getModel("i18n").getResourceBundle();

            if (oContext) {
                var oConversation = oContext.getObject();

                MessageBox.confirm(oI18n.getText("confirmDelete"), {
                    title: oI18n.getText("confirmDeleteTitle"),
                    onClose: function (oAction) {
                        if (oAction === MessageBox.Action.OK) {
                            var oModel = that.getView().getModel("chat");
                            var aConversations = oModel.getProperty("/conversations");
                            var sCurrentId = oModel.getProperty("/currentConversationId");

                            // 过滤掉要删除的对话
                            aConversations = aConversations.filter(function (conv) {
                                return conv.id !== oConversation.id;
                            });

                            oModel.setProperty("/conversations", aConversations);

                            // 同步删除全局对话列表中的对话
                            var aAllConversations = that.getOwnerComponent()._aAllConversations || [];
                            aAllConversations = aAllConversations.filter(function (conv) {
                                return conv.id !== oConversation.id;
                            });
                            that.getOwnerComponent()._aAllConversations = aAllConversations;

                            // 如果删除的是当前对话，清空消息
                            if (sCurrentId === oConversation.id) {
                                oModel.setProperty("/currentConversationId", null);
                                oModel.setProperty("/messages", []);
                                that._clearMessageContainer();
                                that._showWelcomeBox();
                            }

                            that.getOwnerComponent().saveConversationsToStorage();
                            MessageToast.show(oI18n.getText("conversationDeleted"));
                        }
                    }
                });
            }
        },

        // 发送消息
        onSendMessage: function () {
            var oModel = this.getView().getModel("chat");
            var oTextArea = this.byId("messageInput");

            // 直接从TextArea获取值（确保获取最新输入）
            var sMessage = oTextArea ? oTextArea.getValue() : oModel.getProperty("/inputValue");
            var bIsLoading = oModel.getProperty("/isLoading");

            if (!sMessage || !sMessage.trim() || bIsLoading) {
                return;
            }

            // 同步到model
            oModel.setProperty("/inputValue", sMessage);

            // 确保有当前对话
            var sCurrentId = oModel.getProperty("/currentConversationId");
            if (!sCurrentId) {
                this.onNewConversation();
                sCurrentId = oModel.getProperty("/currentConversationId");
            }

            // 添加用户消息
            var oUserMessage = {
                id: this._generateUUID(),
                role: "user",
                content: sMessage.trim(),
                timestamp: new Date().toISOString()
            };

            var aMessages = oModel.getProperty("/messages") || [];
            aMessages.push(oUserMessage);
            oModel.setProperty("/messages", aMessages);

            // 清空输入框（同时更新TextArea和model）
            oModel.setProperty("/inputValue", "");
            if (oTextArea) {
                oTextArea.setValue("");
            }

            // 隐藏欢迎信息
            this._hideWelcomeBox();

            // 渲染用户消息
            this._renderUserMessage(oUserMessage);

            // 设置加载状态
            oModel.setProperty("/isLoading", true);

            // 创建AI消息占位
            var oAIMessage = {
                id: this._generateUUID(),
                role: "assistant",
                content: "",
                timestamp: new Date().toISOString()
            };
            aMessages.push(oAIMessage);
            oModel.setProperty("/messages", aMessages);

            // 渲染AI消息容器
            this._renderAIMessageContainer(oAIMessage.id);

            // 滚动到底部
            this._scrollToBottom();

            // 调用AI接口（流式）
            this._callAIStream(sMessage.trim(), oAIMessage.id);
        },


        // 调用AI流式接口
        // session配置常量（与服务端保持一致）
        _SESSION_CONFIG: {
            MAX_ROUNDS: 50,        // 百炼API限制：最多50轮
            EXPIRE_HOURS: 1,       // 百炼API限制：1小时过期
            FALLBACK_ROUNDS: 10    // 降级时使用的历史轮数
        },

        /**
         * 调用AI流式接口（混合策略）
         * 优先使用 session_id（云端存储），失效时降级到 messages（本地历史）
         */
        _callAIStream: function (sMessage, sMessageId) {
            var that = this;
            var oModel = this.getView().getModel("chat");
            var oI18n = this.getView().getModel("i18n").getResourceBundle();
            var sCurrentId = oModel.getProperty("/currentConversationId");
            var aConversations = oModel.getProperty("/conversations");
            var oCurrentConv = aConversations.find(function (conv) {
                return conv.id === sCurrentId;
            });

            // 获取会话信息
            var sSessionId = oCurrentConv ? oCurrentConv.sessionId : null;
            var oSessionInfo = oCurrentConv ? oCurrentConv.sessionInfo : null;

            // 获取当前消息列表
            var aCurrentMessages = oModel.getProperty("/messages") || [];
            var sAiType = oModel.getProperty("/currentAiType");

            // 构建请求体（根据session状态决定使用哪种模式）
            var oRequestBody = this._buildRequestBody(sMessage, sSessionId, oSessionInfo, aCurrentMessages, sAiType);

            // 使用fetch进行流式请求
            fetch("/api/chat/stream", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(oRequestBody)
            }).then(function (response) {
                if (!response.ok) {
                    throw new Error(oI18n.getText("networkError"));
                }

                // 检查response.body是否存在（浏览器兼容性）
                if (!response.body) {
                    throw new Error(oI18n.getText("streamNotSupported"));
                }

                var reader = response.body.getReader();
                var decoder = new TextDecoder();
                var sFullContent = "";

                function readStream() {
                    return reader.read().then(function (result) {
                        if (result.done) {
                            // 流结束，更新最终内容
                            that._finalizeAIMessage(sMessageId, sFullContent);
                            oModel.setProperty("/isLoading", false);
                            return;
                        }

                        var sChunk = decoder.decode(result.value, { stream: true });
                        var aLines = sChunk.split("\n");

                        aLines.forEach(function (sLine) {
                            if (sLine.startsWith("data: ")) {
                                var sData = sLine.slice(6).trim();

                                if (sData === "[DONE]") {
                                    return;
                                }

                                try {
                                    var oData = JSON.parse(sData);

                                    if (oData.error) {
                                        MessageToast.show(oData.error);
                                        return;
                                    }

                                    if (oData.text) {
                                        // 累加增量内容（百炼API返回的是增量文本）
                                        sFullContent += oData.text;
                                        that._updateAIMessageContent(sMessageId, sFullContent);
                                        that._scrollToBottom();
                                    }

                                    // 保存sessionId到对话中（只保存一次，不在这里更新roundCount）
                                    // roundCount 在 _finalizeAIMessage 中更新，避免流式响应多次累加
                                    if (oData.sessionId && oCurrentConv && !oCurrentConv._sessionIdSaved) {
                                        var iIndex = aConversations.findIndex(function (c) {
                                            return c.id === oCurrentConv.id;
                                        });
                                        if (iIndex >= 0) {
                                            // 更新 sessionId
                                            aConversations[iIndex].sessionId = oData.sessionId;
                                            oCurrentConv._sessionIdSaved = true;  // 标记已保存，避免重复
                                            oModel.setProperty("/conversations", aConversations);
                                        }
                                    }
                                } catch (e) {
                                    // 忽略解析错误
                                }
                            }
                        });

                        return readStream();
                    }).catch(function (streamError) {
                        // 处理流读取过程中的错误
                        console.error("流读取错误:", streamError);
                        if (sFullContent) {
                            // 如果已有部分内容，保存已接收的内容
                            that._finalizeAIMessage(sMessageId, sFullContent);
                        }
                        oModel.setProperty("/isLoading", false);
                        MessageToast.show(oI18n.getText("connectionInterrupted"));
                    });
                }

                return readStream();
            }).catch(function (error) {
                console.error("AI调用错误:", error);
                MessageToast.show(oI18n.getText("aiServiceUnavailable"));
                oModel.setProperty("/isLoading", false);

                // 移除失败的AI消息
                var aMessages = oModel.getProperty("/messages");
                aMessages = aMessages.filter(function (msg) {
                    return msg.id !== sMessageId;
                });
                oModel.setProperty("/messages", aMessages);

                // 移除DOM中的消息容器
                var oContainer = document.getElementById("ai-msg-" + sMessageId);
                if (oContainer) {
                    oContainer.remove();
                }
            });
        },

        // 渲染用户消息（头像在右边）
        _renderUserMessage: function (oMessage) {
            var that = this;
            var oMessageList = this.byId("messageList");
            var oDomRef = oMessageList.getDomRef();

            // 如果DOM未准备好，延迟重试
            if (!oDomRef) {
                setTimeout(function () {
                    that._renderUserMessage(oMessage);
                }, 100);
                return;
            }

            // 用户消息：内容在左，头像在右（通过flex-direction: row-reverse实现）
            var sHtml = '<div class="messageItem userMessage" id="user-msg-' + oMessage.id + '">' +
                '<div class="avatarContainer">' +
                '<span class="sapUiIcon userAvatar" style="font-family: SAP-icons">&#xe036;</span>' +
                '</div>' +
                '<div class="messageContent">' +
                '<div class="messageText">' + this._escapeHtml(oMessage.content) + '</div>' +
                '</div>' +
                '</div>';

            oDomRef.insertAdjacentHTML("beforeend", sHtml);
        },

        // 渲染AI消息容器（用于流式输出）
        _renderAIMessageContainer: function (sMessageId) {
            var that = this;
            var oMessageList = this.byId("messageList");
            var oDomRef = oMessageList.getDomRef();

            // 如果DOM未准备好，延迟重试
            if (!oDomRef) {
                setTimeout(function () {
                    that._renderAIMessageContainer(sMessageId);
                }, 100);
                return;
            }

            var sHtml = '<div class="messageItem aiMessage" id="ai-msg-' + sMessageId + '">' +
                '<div class="avatarContainer">' +
                '<span class="sapUiIcon aiAvatar" style="font-family: SAP-icons">&#xe1c3;</span>' +
                '</div>' +
                '<div class="messageContent">' +
                '<div class="messageText" id="ai-text-' + sMessageId + '">' +
                '<div class="typingIndicator"><span></span><span></span><span></span></div>' +
                '</div>' +
                '</div>' +
                '</div>';

            oDomRef.insertAdjacentHTML("beforeend", sHtml);
        },

        // 更新AI消息内容（流式）
        _updateAIMessageContent: function (sMessageId, sContent) {
            var oTextElement = document.getElementById("ai-text-" + sMessageId);

            if (oTextElement) {
                // 使用marked渲染Markdown
                var sRenderedContent = this._renderMarkdown(sContent);
                oTextElement.innerHTML = sRenderedContent;

                // 高亮代码块
                this._highlightCode(oTextElement);

                // 添加复制按钮
                this._addCopyButtons(oTextElement);
            }
        },


        // 完成AI消息
        _finalizeAIMessage: function (sMessageId, sContent) {
            var oModel = this.getView().getModel("chat");
            var aMessages = oModel.getProperty("/messages");
            var sCurrentId = oModel.getProperty("/currentConversationId");

            // 更新消息内容
            var oMessage = aMessages.find(function (msg) {
                return msg.id === sMessageId;
            });

            if (oMessage) {
                oMessage.content = sContent;
            }

            // 更新对话 - 深拷贝消息数组确保数据独立
            var aConversations = oModel.getProperty("/conversations");
            var iConvIndex = aConversations.findIndex(function (conv) {
                return conv.id === sCurrentId;
            });

            if (iConvIndex >= 0) {
                // 深拷贝消息数组到对话中
                aConversations[iConvIndex].messages = JSON.parse(JSON.stringify(aMessages));
                aConversations[iConvIndex].lastUpdate = this._formatDate(new Date());

                // 更新 sessionInfo（每轮对话完成时更新一次）
                if (aConversations[iConvIndex].sessionId) {
                    if (!aConversations[iConvIndex].sessionInfo) {
                        // 首次初始化
                        aConversations[iConvIndex].sessionInfo = {
                            createdAt: new Date().toISOString(),
                            roundCount: 1
                        };
                    } else {
                        // 累加轮次
                        aConversations[iConvIndex].sessionInfo.roundCount++;
                    }
                    console.log("[AI] 当前轮次: " + aConversations[iConvIndex].sessionInfo.roundCount);
                }

                // 重置 _sessionIdSaved 标记，为下一轮做准备
                delete aConversations[iConvIndex]._sessionIdSaved;

                // 如果是第一条消息，用内容作为标题
                var oI18n = this.getView().getModel("i18n").getResourceBundle();
                var sNewConvTitle = oI18n.getText("newConversation");
                if (aMessages.length <= 2 && aConversations[iConvIndex].title === sNewConvTitle) {
                    var sFirstUserMsg = aMessages[0] ? aMessages[0].content : "";
                    aConversations[iConvIndex].title = sFirstUserMsg.substring(0, 20) + (sFirstUserMsg.length > 20 ? "..." : "");
                }
            }

            // 显式设置回模型触发更新
            oModel.setProperty("/conversations", aConversations);
            oModel.setProperty("/messages", aMessages);

            // 同步更新到全局对话列表
            this._syncToAllConversations(aConversations);

            // 保存到localStorage
            this.getOwnerComponent().saveConversationsToStorage();
        },

        /**
         * 同步当前显示的对话到全局对话列表
         * @param {Array} aFilteredConversations 当前显示的对话列表
         */
        _syncToAllConversations: function (aFilteredConversations) {
            var aAllConversations = this.getOwnerComponent()._aAllConversations || [];

            // 更新全局列表中对应的对话
            aFilteredConversations.forEach(function (oConv) {
                var iIndex = aAllConversations.findIndex(function (c) {
                    return c.id === oConv.id;
                });
                if (iIndex >= 0) {
                    aAllConversations[iIndex] = oConv;
                }
            });

            this.getOwnerComponent()._aAllConversations = aAllConversations;
        },

        // 渲染Markdown
        _renderMarkdown: function (sContent) {
            if (typeof marked !== "undefined") {
                // 配置marked
                marked.setOptions({
                    breaks: true,
                    gfm: true
                });
                return marked.parse(sContent);
            }
            return this._escapeHtml(sContent);
        },

        // 高亮代码
        _highlightCode: function (oElement) {
            if (typeof hljs !== "undefined") {
                var aCodeBlocks = oElement.querySelectorAll("pre code");
                aCodeBlocks.forEach(function (block) {
                    hljs.highlightElement(block);
                });
            }
        },

        // 添加复制按钮到代码块
        _addCopyButtons: function (oElement) {
            var that = this;
            var aPreBlocks = oElement.querySelectorAll("pre");
            var oI18n = this.getView().getModel("i18n").getResourceBundle();
            var sCopyText = oI18n.getText("copy");
            var sCopiedText = oI18n.getText("copied");

            aPreBlocks.forEach(function (pre) {
                // 检查是否已有复制按钮
                if (pre.querySelector(".copyButton")) {
                    return;
                }

                // 创建复制按钮
                var oCopyBtn = document.createElement("button");
                oCopyBtn.className = "copyButton";
                // SAP-icons: &#xe0ec; = copy (复制图标)
                oCopyBtn.innerHTML = '<span class="sapUiIcon" style="font-family: SAP-icons">&#xe0ec;</span> ' + sCopyText;
                oCopyBtn.onclick = function () {
                    var sCode = pre.querySelector("code") ? pre.querySelector("code").textContent : pre.textContent;
                    navigator.clipboard.writeText(sCode).then(function () {
                        // SAP-icons: &#xe05b; = accept (勾选图标，表示复制成功)
                        oCopyBtn.innerHTML = '<span class="sapUiIcon" style="font-family: SAP-icons">&#xe05b;</span> ' + sCopiedText;
                        setTimeout(function () {
                            oCopyBtn.innerHTML = '<span class="sapUiIcon" style="font-family: SAP-icons">&#xe0ec;</span> ' + sCopyText;
                        }, 2000);
                    });
                };

                // 包装pre元素
                var oWrapper = document.createElement("div");
                oWrapper.className = "codeBlockWrapper";
                pre.parentNode.insertBefore(oWrapper, pre);
                oWrapper.appendChild(pre);
                oWrapper.appendChild(oCopyBtn);
            });
        },

        // 渲染所有消息（切换对话时使用）
        _renderMessages: function () {
            var that = this;
            var oModel = this.getView().getModel("chat");
            var aMessages = oModel.getProperty("/messages") || [];

            // 清空消息容器
            this._clearMessageContainer();

            // 渲染每条消息
            aMessages.forEach(function (oMessage) {
                if (oMessage.role === "user") {
                    that._renderUserMessage(oMessage);
                } else if (oMessage.role === "assistant") {
                    that._renderAIMessageContainer(oMessage.id);
                    if (oMessage.content) {
                        that._updateAIMessageContent(oMessage.id, oMessage.content);
                    }
                }
            });
        },

        // 清空消息容器
        _clearMessageContainer: function () {
            var oMessageList = this.byId("messageList");
            var oDomRef = oMessageList.getDomRef();

            if (oDomRef) {
                oDomRef.innerHTML = "";
            }
        },

        // 滚动到底部
        _scrollToBottom: function () {
            var oScrollContainer = this.byId("messageScrollContainer");

            if (oScrollContainer) {
                setTimeout(function () {
                    var oDomRef = oScrollContainer.getDomRef();
                    if (oDomRef) {
                        oDomRef.scrollTop = oDomRef.scrollHeight;
                    }
                }, 100);
            }
        },

        /**
         * 构建API请求体（混合策略核心逻辑）
         * 优先使用 session_id，失效时降级到 messages
         * @param {string} sMessage 当前消息
         * @param {string} sSessionId 会话ID
         * @param {object} oSessionInfo 会话信息
         * @param {Array} aMessages 消息数组
         * @param {string} sAiType AI类型
         * @returns {object} 请求体
         */
        _buildRequestBody: function (sMessage, sSessionId, oSessionInfo, aMessages, sAiType) {
            var bUseSessionId = this._shouldUseSessionId(sSessionId, oSessionInfo);

            // 获取已就绪的会话文件ID列表
            var aSessionFileIds = this._getReadySessionFileIds();

            if (aSessionFileIds.length > 0) {
                console.log("[AI] 附带会话文件: " + aSessionFileIds.join(", "));
            }

            if (bUseSessionId) {
                // 方案1：使用 session_id（云端存储，省token）
                console.log("[AI] 使用 session_id 模式");
                return {
                    message: sMessage,  // 只发送当前消息
                    sessionId: sSessionId,
                    sessionInfo: oSessionInfo,
                    aiType: sAiType,
                    sessionFileIds: aSessionFileIds
                };
            } else if (aMessages && aMessages.length > 2) {
                // 方案2：使用 messages 数组（本地历史，降级方案）
                console.log("[AI] 使用 messages 模式（降级）");
                var aHistoryMessages = this._buildMessagesArray(aMessages);
                return {
                    message: sMessage,
                    messages: aHistoryMessages,
                    sessionInfo: oSessionInfo,
                    aiType: sAiType,
                    sessionFileIds: aSessionFileIds
                };
            } else {
                // 方案3：新对话
                console.log("[AI] 新对话模式");
                return {
                    message: sMessage,
                    aiType: sAiType,
                    sessionFileIds: aSessionFileIds
                };
            }
        },

        /**
         * 判断是否应该使用 session_id
         * @param {string} sSessionId 会话ID
         * @param {object} oSessionInfo 会话信息
         * @returns {boolean} 是否使用 session_id
         */
        _shouldUseSessionId: function (sSessionId, oSessionInfo) {
            if (!sSessionId) {
                return false;
            }

            if (!oSessionInfo) {
                // 有 sessionId 但没有 sessionInfo，可能是旧数据，尝试使用
                return true;
            }

            // 检查轮次限制
            if (oSessionInfo.roundCount >= this._SESSION_CONFIG.MAX_ROUNDS) {
                console.log("[AI] session_id 已达轮次上限，切换到 messages 模式");
                return false;
            }

            // 检查时间限制
            if (oSessionInfo.createdAt) {
                var nCreatedTime = new Date(oSessionInfo.createdAt).getTime();
                var nNow = Date.now();
                var nExpireTime = this._SESSION_CONFIG.EXPIRE_HOURS * 60 * 60 * 1000;

                if (nNow - nCreatedTime > nExpireTime) {
                    console.log("[AI] session_id 已过期，切换到 messages 模式");
                    return false;
                }
            }

            return true;
        },

        /**
         * 构建 messages 数组（用于降级方案）
         * 格式符合百炼API要求：[{role: "user", content: "..."}, {role: "assistant", content: "..."}]
         * @param {Array} aMessages 消息数组
         * @returns {Array} 格式化的 messages 数组
         */
        _buildMessagesArray: function (aMessages) {
            // 排除最后两条（当前用户消息和AI占位消息）
            var aHistory = aMessages.slice(0, -2);

            // 只取最近N轮，避免token超限
            var nMaxRounds = this._SESSION_CONFIG.FALLBACK_ROUNDS;
            var nMaxMessages = nMaxRounds * 2;  // 每轮包含用户和AI各一条
            if (aHistory.length > nMaxMessages) {
                aHistory = aHistory.slice(-nMaxMessages);
            }

            // 转换为百炼API格式
            return aHistory.filter(function (msg) {
                return msg.content;  // 过滤空内容
            }).map(function (msg) {
                var sContent = msg.content;
                // AI回复截断，避免token过长
                if (msg.role === "assistant" && sContent.length > 1000) {
                    sContent = sContent.substring(0, 1000) + "...";
                }
                return {
                    role: msg.role,
                    content: sContent
                };
            });
        },

        /**
         * 构建包含历史对话的上下文提示（备用方案）
         * 将之前的对话历史拼接到当前消息中，让AI能够理解上下文
         * @param {Array} aMessages 当前对话的所有消息
         * @param {string} sCurrentMessage 当前用户发送的消息
         * @returns {string} 包含上下文的完整提示
         */
        _buildContextPrompt: function (aMessages, sCurrentMessage) {
            // 如果只有当前消息（加上刚创建的AI占位消息），直接返回
            if (aMessages.length <= 2) {
                return sCurrentMessage;
            }

            // 构建历史对话上下文（排除最后两条：当前用户消息和AI占位消息）
            var aHistory = aMessages.slice(0, -2);
            var sContext = "以下是我们之前的对话历史：\n\n";

            aHistory.forEach(function (msg) {
                if (msg.role === "user") {
                    sContext += "用户: " + msg.content + "\n\n";
                } else if (msg.role === "assistant" && msg.content) {
                    // AI回复只取前500字符，避免上下文过长
                    var sContent = msg.content.length > 500
                        ? msg.content.substring(0, 500) + "..."
                        : msg.content;
                    sContext += "助手: " + sContent + "\n\n";
                }
            });

            sContext += "---\n\n现在用户的新问题是：\n" + sCurrentMessage;
            sContext += "\n\n请基于以上对话历史来回答用户的问题。";

            return sContext;
        },

        // 生成UUID
        _generateUUID: function () {
            return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
                var r = Math.random() * 16 | 0;
                var v = c === "x" ? r : (r & 0x3 | 0x8);
                return v.toString(16);
            });
        },

        // 格式化日期
        _formatDate: function (oDate) {
            var sYear = oDate.getFullYear();
            var sMonth = String(oDate.getMonth() + 1).padStart(2, "0");
            var sDay = String(oDate.getDate()).padStart(2, "0");
            var sHour = String(oDate.getHours()).padStart(2, "0");
            var sMinute = String(oDate.getMinutes()).padStart(2, "0");

            return sYear + "-" + sMonth + "-" + sDay + " " + sHour + ":" + sMinute;
        },

        // HTML转义
        _escapeHtml: function (sText) {
            var oDiv = document.createElement("div");
            oDiv.textContent = sText;
            return oDiv.innerHTML;
        },

        // 隐藏欢迎框
        _hideWelcomeBox: function () {
            var oWelcomeBox = this.byId("welcomeBox");
            if (oWelcomeBox) {
                oWelcomeBox.setVisible(false);
            }
        },

        // 显示欢迎框
        _showWelcomeBox: function () {
            var oWelcomeBox = this.byId("welcomeBox");
            if (oWelcomeBox) {
                oWelcomeBox.setVisible(true);
            }
        },

        // ==================== 文件上传相关函数 ====================

        /**
         * 绑定隐藏的文件输入框的change事件
         */
        _bindFileInputChange: function () {
            var that = this;

            // 延迟等待DOM渲染完成
            setTimeout(function () {
                var oFileInput = document.getElementById("hiddenFileInput");
                if (oFileInput && !oFileInput._boundChange) {
                    oFileInput.addEventListener("change", function (oEvent) {
                        that._handleFileSelect(oEvent);
                    });
                    oFileInput._boundChange = true;
                }
            }, 500);
        },

        /**
         * 点击上传按钮，触发隐藏的文件输入
         */
        onUploadFile: function () {
            var oModel = this.getView().getModel("chat");
            var aAttachments = oModel.getProperty("/attachments") || [];
            var oI18n = this.getView().getModel("i18n").getResourceBundle();

            // 检查附件数量限制
            if (aAttachments.length >= FILE_UPLOAD_CONFIG.MAX_FILES_PER_SESSION) {
                MessageToast.show(oI18n.getText("maxFilesReached") || "最多只能上传 " + FILE_UPLOAD_CONFIG.MAX_FILES_PER_SESSION + " 个文件");
                return;
            }

            var oFileInput = document.getElementById("hiddenFileInput");
            if (oFileInput) {
                oFileInput.value = "";  // 清空以允许重复选择同一文件
                oFileInput.click();
            }
        },

        /**
         * 处理文件选择
         */
        _handleFileSelect: function (oEvent) {
            var that = this;
            var oFile = oEvent.target.files[0];
            var oI18n = this.getView().getModel("i18n").getResourceBundle();

            if (!oFile) {
                return;
            }

            // 验证文件大小
            if (oFile.size > FILE_UPLOAD_CONFIG.MAX_FILE_SIZE) {
                MessageBox.error(
                    (oI18n.getText("fileTooLarge") || "文件过大") +
                    "，最大支持 " + this._formatFileSize(FILE_UPLOAD_CONFIG.MAX_FILE_SIZE)
                );
                return;
            }

            // 验证文件类型
            var sExt = '.' + oFile.name.split('.').pop().toLowerCase();
            if (!FILE_UPLOAD_CONFIG.ALLOWED_EXTENSIONS.includes(sExt)) {
                MessageBox.error(
                    (oI18n.getText("unsupportedFileType") || "不支持的文件类型") + ": " + sExt
                );
                return;
            }

            // 创建附件对象
            var oAttachment = {
                id: this._generateUUID(),
                file: oFile,
                fileName: oFile.name,
                fileSize: oFile.size,
                fileExt: sExt.substring(1),
                status: 'uploading',
                progress: 0,
                fileId: null,
                message: oI18n.getText("uploading") || "上传中..."
            };

            // 添加到附件列表
            var oModel = this.getView().getModel("chat");
            var aAttachments = oModel.getProperty("/attachments") || [];
            aAttachments.push(oAttachment);
            oModel.setProperty("/attachments", aAttachments);

            // 渲染附件卡片
            this._renderAttachmentCard(oAttachment);

            // 更新附件区域可见性
            this._updateAttachmentAreaVisibility();

            // 开始上传
            this._uploadFile(oAttachment);
        },

        /**
         * 上传文件到后端
         */
        _uploadFile: function (oAttachment) {
            var that = this;
            var oI18n = this.getView().getModel("i18n").getResourceBundle();

            var oFormData = new FormData();
            oFormData.append("file", oAttachment.file);

            // 模拟上传进度
            var nProgress = 0;
            var progressInterval = setInterval(function () {
                if (nProgress < 90) {
                    nProgress += 10;
                    that._updateAttachmentCard(oAttachment.id, {
                        progress: nProgress,
                        status: 'uploading'
                    });
                }
            }, 200);

            fetch("/api/files/session", {
                method: "POST",
                body: oFormData
            })
                .then(function (response) {
                    clearInterval(progressInterval);

                    if (!response.ok) {
                        return response.json().then(function (err) {
                            throw new Error(err.error || "上传失败");
                        });
                    }
                    return response.json();
                })
                .then(function (data) {
                    // 上传成功，更新状态为处理中
                    that._updateAttachmentCard(oAttachment.id, {
                        fileId: data.fileId,
                        status: 'processing',
                        progress: 100,
                        message: oI18n.getText("parsing") || "解析中..."
                    });

                    // 更新模型中的附件数据
                    that._updateAttachmentInModel(oAttachment.id, {
                        fileId: data.fileId,
                        status: 'processing'
                    });

                    // 开始轮询文件状态
                    that._pollFileStatus(oAttachment.id, data.fileId, 0);
                })
                .catch(function (error) {
                    clearInterval(progressInterval);
                    console.error("[FileUpload] 上传错误:", error);

                    that._updateAttachmentCard(oAttachment.id, {
                        status: 'error',
                        progress: 0,
                        message: error.message || "上传失败"
                    });

                    that._updateAttachmentInModel(oAttachment.id, {
                        status: 'error',
                        message: error.message
                    });

                    MessageToast.show(error.message || "文件上传失败");
                });
        },

        /**
         * 轮询文件解析状态
         */
        _pollFileStatus: function (sAttachmentId, sFileId, nAttempts) {
            var that = this;
            var oI18n = this.getView().getModel("i18n").getResourceBundle();

            if (nAttempts >= FILE_UPLOAD_CONFIG.MAX_POLL_ATTEMPTS) {
                that._updateAttachmentCard(sAttachmentId, {
                    status: 'error',
                    message: oI18n.getText("parseTimeout") || "解析超时"
                });
                that._updateAttachmentInModel(sAttachmentId, {
                    status: 'error',
                    message: "解析超时"
                });
                return;
            }

            fetch("/api/files/session/" + sFileId + "/status")
                .then(function (response) {
                    if (!response.ok) {
                        throw new Error("查询状态失败");
                    }
                    return response.json();
                })
                .then(function (data) {
                    if (data.status === 'ready') {
                        // 文件解析完成
                        that._updateAttachmentCard(sAttachmentId, {
                            status: 'ready',
                            progress: 100,
                            message: oI18n.getText("ready") || "已就绪"
                        });
                        that._updateAttachmentInModel(sAttachmentId, {
                            status: 'ready'
                        });
                        MessageToast.show(data.fileName + " " + (oI18n.getText("parseComplete") || "解析完成"));
                    } else if (data.status === 'error') {
                        // 解析失败
                        that._updateAttachmentCard(sAttachmentId, {
                            status: 'error',
                            message: data.message || "解析失败"
                        });
                        that._updateAttachmentInModel(sAttachmentId, {
                            status: 'error',
                            message: data.message
                        });
                    } else {
                        // 还在处理中，继续轮询
                        that._updateAttachmentCard(sAttachmentId, {
                            status: 'processing',
                            message: data.message || "解析中..."
                        });

                        setTimeout(function () {
                            that._pollFileStatus(sAttachmentId, sFileId, nAttempts + 1);
                        }, FILE_UPLOAD_CONFIG.POLL_INTERVAL);
                    }
                })
                .catch(function (error) {
                    console.error("[FileUpload] 轮询状态错误:", error);
                    // 出错后继续尝试
                    setTimeout(function () {
                        that._pollFileStatus(sAttachmentId, sFileId, nAttempts + 1);
                    }, FILE_UPLOAD_CONFIG.POLL_INTERVAL);
                });
        },

        /**
         * 渲染附件卡片
         */
        _renderAttachmentCard: function (oAttachment) {
            var that = this;
            var oAttachmentList = this.byId("attachmentList");

            if (!oAttachmentList) {
                return;
            }

            var oDomRef = oAttachmentList.getDomRef();
            if (!oDomRef) {
                setTimeout(function () {
                    that._renderAttachmentCard(oAttachment);
                }, 100);
                return;
            }

            var oIconInfo = this._getFileTypeIcon(oAttachment.fileExt);
            var sProgressClass = oAttachment.status === 'ready' ? 'complete' : '';
            var sIndeterminate = oAttachment.status === 'processing' ? 'indeterminate' : '';

            var sHtml = '<div class="fileCard" id="file-card-' + oAttachment.id + '">' +
                '<div class="fileIconContainer ' + oIconInfo.class + '">' +
                '<span class="sapUiIcon fileIcon" style="font-family: SAP-icons">' + oIconInfo.icon + '</span>' +
                '</div>' +
                '<div class="fileInfo">' +
                '<span class="fileName" title="' + oAttachment.fileName + '">' + oAttachment.fileName + '</span>' +
                '<span class="fileStatus ' + oAttachment.status + '" id="file-status-' + oAttachment.id + '">' +
                oAttachment.message +
                '</span>' +
                '<div class="progressBarContainer ' + sIndeterminate + '" id="file-progress-container-' + oAttachment.id + '">' +
                '<div class="progressBar ' + sProgressClass + '" id="file-progress-' + oAttachment.id + '" style="width: ' + oAttachment.progress + '%"></div>' +
                '</div>' +
                '</div>' +
                '<button class="fileDeleteBtn" id="file-delete-' + oAttachment.id + '" title="删除">' +
                '<span class="sapUiIcon deleteIcon" style="font-family: SAP-icons">&#xe03e;</span>' +
                '</button>' +
                '</div>';

            oDomRef.insertAdjacentHTML("beforeend", sHtml);

            // 绑定删除按钮事件
            var oDeleteBtn = document.getElementById("file-delete-" + oAttachment.id);
            if (oDeleteBtn) {
                oDeleteBtn.addEventListener("click", function () {
                    that._removeAttachment(oAttachment.id);
                });
            }
        },

        /**
         * 更新附件卡片状态
         */
        _updateAttachmentCard: function (sAttachmentId, oUpdates) {
            var oStatusEl = document.getElementById("file-status-" + sAttachmentId);
            var oProgressEl = document.getElementById("file-progress-" + sAttachmentId);
            var oProgressContainer = document.getElementById("file-progress-container-" + sAttachmentId);
            var oCardEl = document.getElementById("file-card-" + sAttachmentId);

            if (oStatusEl && oUpdates.message !== undefined) {
                oStatusEl.textContent = oUpdates.message;
                oStatusEl.className = "fileStatus " + (oUpdates.status || '');
            }

            if (oProgressEl && oUpdates.progress !== undefined) {
                oProgressEl.style.width = oUpdates.progress + "%";
                if (oUpdates.status === 'ready') {
                    oProgressEl.classList.add('complete');
                }
            }

            if (oProgressContainer && oUpdates.status) {
                if (oUpdates.status === 'processing') {
                    oProgressContainer.classList.add('indeterminate');
                } else {
                    oProgressContainer.classList.remove('indeterminate');
                }
            }

            if (oCardEl && oUpdates.status === 'ready') {
                oCardEl.classList.add('ready');
            }
        },

        /**
         * 更新模型中的附件数据
         */
        _updateAttachmentInModel: function (sAttachmentId, oUpdates) {
            var oModel = this.getView().getModel("chat");
            var aAttachments = oModel.getProperty("/attachments") || [];

            var iIndex = aAttachments.findIndex(function (a) {
                return a.id === sAttachmentId;
            });

            if (iIndex >= 0) {
                Object.assign(aAttachments[iIndex], oUpdates);
                oModel.setProperty("/attachments", aAttachments);
            }
        },

        /**
         * 删除附件
         */
        _removeAttachment: function (sAttachmentId) {
            var oModel = this.getView().getModel("chat");
            var aAttachments = oModel.getProperty("/attachments") || [];

            // 从模型中移除
            aAttachments = aAttachments.filter(function (a) {
                return a.id !== sAttachmentId;
            });
            oModel.setProperty("/attachments", aAttachments);

            // 从DOM中移除
            var oCardEl = document.getElementById("file-card-" + sAttachmentId);
            if (oCardEl) {
                oCardEl.remove();
            }

            // 更新附件区域可见性
            this._updateAttachmentAreaVisibility();
        },

        /**
         * 更新附件区域可见性
         */
        _updateAttachmentAreaVisibility: function () {
            var oModel = this.getView().getModel("chat");
            var aAttachments = oModel.getProperty("/attachments") || [];
            var oAttachmentArea = this.byId("attachmentPreviewArea");

            if (oAttachmentArea) {
                oAttachmentArea.setVisible(aAttachments.length > 0);
            }
        },

        /**
         * 获取文件类型对应的图标信息
         */
        _getFileTypeIcon: function (sExt) {
            var sLowerExt = (sExt || '').toLowerCase();
            return FILE_TYPE_ICONS[sLowerExt] || FILE_TYPE_ICONS['default'];
        },

        /**
         * 格式化文件大小
         */
        _formatFileSize: function (nBytes) {
            if (nBytes < 1024) {
                return nBytes + " B";
            } else if (nBytes < 1024 * 1024) {
                return (nBytes / 1024).toFixed(1) + " KB";
            } else {
                return (nBytes / (1024 * 1024)).toFixed(1) + " MB";
            }
        },

        /**
         * 获取已就绪的会话文件ID列表
         */
        _getReadySessionFileIds: function () {
            var oModel = this.getView().getModel("chat");
            var aAttachments = oModel.getProperty("/attachments") || [];

            return aAttachments
                .filter(function (a) {
                    return a.status === 'ready' && a.fileId && a.fileId.startsWith('file_session_');
                })
                .map(function (a) {
                    return a.fileId;
                });
        },

        /**
         * 清空当前会话的所有附件
         */
        _clearAttachments: function () {
            var oModel = this.getView().getModel("chat");
            oModel.setProperty("/attachments", []);

            // 清空DOM
            var oAttachmentList = this.byId("attachmentList");
            if (oAttachmentList) {
                var oDomRef = oAttachmentList.getDomRef();
                if (oDomRef) {
                    oDomRef.innerHTML = "";
                }
            }

            this._updateAttachmentAreaVisibility();
        }
    });
});
