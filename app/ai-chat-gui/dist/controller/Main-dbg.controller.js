sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/m/MessageBox",
    "sap/m/MessageToast",
    "com/ai/assistant/aichatapp/util/Utils"
], function (Controller, MessageBox, MessageToast, Utils) {
    "use strict";

    // comment
    var FILE_UPLOAD_CONFIG = {
        MAX_FILE_SIZE: 50 * 1024 * 1024,  // 50MB
        MAX_FILES_PER_SESSION: 5,
        ALLOWED_EXTENSIONS: ['.pdf', '.docx', '.txt', '.md', '.json', '.xml', '.csv', '.xlsx', '.xls'],
        POLL_INTERVAL: 2000,              // Ã¨Â½Â®Ã¨Â¯Â¢Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½a2ÃƒÂ§Ã‚Â§Ã¢â‚¬â„¢
        MAX_POLL_ATTEMPTS: 60             // Max polling attempts (~2 minutes)
    };

    // comment
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

    var CHAT_REQUEST_LIMITS = {
        MAX_USER_MESSAGE_LENGTH: 120000,
        MAX_PROMPT_LENGTH: 110000
    };

    return Controller.extend("com.ai.assistant.aichatapp.controller.Main", {

        onInit: function () {
            // comment
            // comment
            this._isExiting = false;
            this._pendingTimeouts = new Set();
            this._oActiveStreamController = null;
            this._fnMessageInputKeydown = null;
            this._oBoundTextAreaElement = null;
            this._fnFileInputChange = null;
            this._oBoundFileInput = null;
            this._bSidebarWidthCustomized = false;
            this._fnSidebarPointerDown = null;
            this._oSidebarDomRef = null;

            // comment
            var oRouter = this.getOwnerComponent().getRouter();
            this._oChatRoute = oRouter.getRoute("chat");
            this._oChatRoute.attachPatternMatched(this._onRouteMatched, this);
        },
        _syncWelcomeBoxAfterRender: function () {
            var oModel = this.getView().getModel("chat");
            var aMessages = oModel.getProperty("/messages") || [];
            if (aMessages.length > 0) {
                this._renderMessages();
                this._hideWelcomeBox();
            } else {
                this._showWelcomeBox();
            }
        },


        /**
          *
         */
        onAfterRendering: function () {
            this._bindKeyboardShortcut();
            this._bindFileInputChange();
            this._renderAttachmentsFromModel();
            this._syncWelcomeBoxAfterRender();
            this._bindSidebarResizeIntent();
            this._applySidebarColumnWidth();

            if (!this._fnSidebarResizeHandler) {
                this._fnSidebarResizeHandler = this._applySidebarColumnWidth.bind(this);
                window.addEventListener("resize", this._fnSidebarResizeHandler);
            }
        },

        /**
          *
          *
         */
        _bindKeyboardShortcut: function () {
            var oTextArea = this.byId("messageInput");

            if (oTextArea && oTextArea.getDomRef()) {
                var oDomRef = oTextArea.getDomRef();
                var oTextAreaElement = oDomRef.querySelector("textarea");

                if (oTextAreaElement) {
                    // comment
                    if (this._oBoundTextAreaElement && this._oBoundTextAreaElement !== oTextAreaElement && this._fnMessageInputKeydown) {
                        this._oBoundTextAreaElement.removeEventListener("keydown", this._fnMessageInputKeydown, true);
                        this._oBoundTextAreaElement = null;
                    }

                    if (this._oBoundTextAreaElement === oTextAreaElement && this._fnMessageInputKeydown) {
                        return;
                    }

                    if (!this._fnMessageInputKeydown) {
                        var that = this;
                        this._fnMessageInputKeydown = function (oEvent) {
                            // comment
                            if (oEvent.key === "Enter" && !oEvent.shiftKey) {
                                oEvent.preventDefault();
                                oEvent.stopPropagation();
                                that.onSendMessage();
                            }
                            // comment
                        };
                    }

                    oTextAreaElement.addEventListener("keydown", this._fnMessageInputKeydown, true);
                    this._oBoundTextAreaElement = oTextAreaElement;
                }
            }
        },

        /**
          *
          *
         */
        _onRouteMatched: function (oEvent) {
            var sAiType = oEvent.getParameter("arguments").aiType;
            var oModel = this.getView().getModel("chat");
            var oI18n = this.getView().getModel("i18n").getResourceBundle();
            var sPreviousAiType = oModel.getProperty("/currentAiType");

            if (oModel.getProperty("/isLoading")) {
                this._abortActiveStreamRequest();
                oModel.setProperty("/isLoading", false);
            }

            // comment
            if (!oModel.getProperty("/attachments")) {
                oModel.setProperty("/attachments", []);
            }

            // comment
            oModel.setProperty("/currentAiType", sAiType);

            // comment
            var sTitleKey = this._getAiTitleKey(sAiType);
            var sTitle = oI18n.getText(sTitleKey);
            oModel.setProperty("/currentAiTitle", sTitle);

            // comment
            this.byId("chatPageTitle").setText(sTitle);

            // comment
            this._updateWelcomeMessage(sAiType);

            // comment
            if (sPreviousAiType && sPreviousAiType !== sAiType) {
                this._resetCurrentConversation();
            }

            // comment
            this._filterConversationsByAiType(sAiType);
        },

        /**
          *
         */
        _resetCurrentConversation: function () {
            var oModel = this.getView().getModel("chat");

            // comment
            oModel.setProperty("/currentConversationId", null);
            oModel.setProperty("/messages", []);
            this._setAttachmentsForConversation(null);

            // comment
            this._clearMessageContainer();
            this._showWelcomeBox();
        },

        /**
          *
          *
         */
        _filterConversationsByAiType: function (sAiType) {
            var oModel = this.getView().getModel("chat");
            var aAllConversations = this.getOwnerComponent()._aAllConversations || [];

            // comment
            var aFilteredConversations = aAllConversations.filter(function (conv) {
                return conv.aiType === sAiType;
            });

            oModel.setProperty("/conversations", aFilteredConversations);
        },

        /**
          *
          *
         */
        _updateWelcomeMessage: function (sAiType) {
            var oI18n = this.getView().getModel("i18n").getResourceBundle();
            var oWelcomeBox = this.byId("welcomeBox");

            if (!oWelcomeBox) {
                return;
            }

            // comment
            var sWelcomeTitleKey = "welcomeTitle_" + sAiType;
            var sWelcomeMessageKey = "welcomeMessage_" + sAiType;

            // comment
            var sWelcomeTitle = oI18n.getText(sWelcomeTitleKey);
            var sWelcomeMessage = oI18n.getText(sWelcomeMessageKey);

            // comment
            if (sWelcomeTitle === sWelcomeTitleKey) {
                sWelcomeTitle = oI18n.getText("welcomeTitle");
            }
            if (sWelcomeMessage === sWelcomeMessageKey) {
                sWelcomeMessage = oI18n.getText("welcomeMessage");
            }

            // comment
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
          *
          *
          *
         */
        _getAiTitleKey: function (sAiType) {
            var oTitleMap = {
                "abap-clean-core": "abapCleanCoreTitle",
                "cpi": "cpiAiTitle",
                "func-doc": "funcDocAiTitle",
                "fsd2tsd-i": "fsd2tsdITitle",
                "fsd2tsd-e": "fsd2tsdETitle",
                "tech-doc": "techDocAiTitle",
                "code-review": "codeReviewTitle",
                "unit-test": "unitTestTitle"
            };
            return oTitleMap[sAiType] || "appTitle";
        },

        /**
          *
         */
        onNavBack: function () {
            this._abortActiveStreamRequest();
            var oRouter = this.getOwnerComponent().getRouter();
            oRouter.navTo("home");
        },

        // comment
        onToggleSidebar: function () {
            var oFlexibleColumnLayout = this.byId("flexibleColumnLayout");
            var sCurrentLayout = oFlexibleColumnLayout.getLayout();

            if (sCurrentLayout === "OneColumn" || sCurrentLayout === "MidColumnFullScreen") {
                // comment
                oFlexibleColumnLayout.setLayout("TwoColumnsMidExpanded");
            } else {
                // comment
                oFlexibleColumnLayout.setLayout("MidColumnFullScreen");
            }

            this._setManagedTimeout(function () {
                this._applySidebarColumnWidth();
            }.bind(this), 0);
        },

        _bindSidebarResizeIntent: function () {
            var oFlexibleColumnLayout = this.byId("flexibleColumnLayout");
            if (!oFlexibleColumnLayout) {
                return;
            }

            var oDomRef = oFlexibleColumnLayout.getDomRef();
            if (!oDomRef) {
                return;
            }

            if (this._oSidebarDomRef && this._oSidebarDomRef !== oDomRef && this._fnSidebarPointerDown) {
                this._oSidebarDomRef.removeEventListener("pointerdown", this._fnSidebarPointerDown, true);
                this._oSidebarDomRef.removeEventListener("mousedown", this._fnSidebarPointerDown, true);
                this._oSidebarDomRef = null;
            }

            if (!this._fnSidebarPointerDown) {
                var that = this;
                this._fnSidebarPointerDown = function (oEvent) {
                    if (that._isExiting || that._bSidebarWidthCustomized) {
                        return;
                    }

                    var oTarget = oEvent.target;
                    if (!oTarget || !oTarget.closest) {
                        return;
                    }

                    var bHitSeparator = Boolean(oTarget.closest(".sapFFCLSeparator, .sapFFCLResizer, .sapUiLoSplitterBar, .sapUiLoSplitterBarGrip, .sapUiLoSplitterBarIcon"));
                    if (!bHitSeparator) {
                        var oCursorCheck = oTarget;
                        while (oCursorCheck && oCursorCheck !== oDomRef) {
                            var sCursor = window.getComputedStyle(oCursorCheck).cursor || "";
                            if (sCursor.indexOf("col-resize") !== -1 || sCursor.indexOf("ew-resize") !== -1) {
                                bHitSeparator = true;
                                break;
                            }
                            oCursorCheck = oCursorCheck.parentElement;
                        }
                    }

                    if (!bHitSeparator && typeof oEvent.clientX === "number") {
                        var sBaseId = oFlexibleColumnLayout.getId();
                        var oBeginColumn = document.getElementById(sBaseId + "-beginColumn");
                        if (oBeginColumn) {
                            var oRect = oBeginColumn.getBoundingClientRect();
                            // comment
                            bHitSeparator = Math.abs(oEvent.clientX - oRect.right) <= 14;
                        }
                    }

                    if (!bHitSeparator) {
                        return;
                    }

                    that._bSidebarWidthCustomized = true;
                    that._clearSidebarColumnWidth();
                };
            }

            if (this._oSidebarDomRef !== oDomRef) {
                oDomRef.addEventListener("pointerdown", this._fnSidebarPointerDown, true);
                oDomRef.addEventListener("mousedown", this._fnSidebarPointerDown, true);
                this._oSidebarDomRef = oDomRef;
            }
        },

        _clearSidebarColumnWidth: function () {
            var oFlexibleColumnLayout = this.byId("flexibleColumnLayout");
            if (!oFlexibleColumnLayout) {
                return;
            }

            var sBaseId = oFlexibleColumnLayout.getId();
            var oBeginColumn = document.getElementById(sBaseId + "-beginColumn");
            var oMidColumn = document.getElementById(sBaseId + "-midColumn");

            if (oBeginColumn) {
                oBeginColumn.style.removeProperty("flex");
                oBeginColumn.style.removeProperty("max-width");
                oBeginColumn.style.removeProperty("width");
            }
            if (oMidColumn) {
                oMidColumn.style.removeProperty("flex");
                oMidColumn.style.removeProperty("max-width");
                oMidColumn.style.removeProperty("width");
            }
        },

        _applySidebarColumnWidth: function () {
            var oFlexibleColumnLayout = this.byId("flexibleColumnLayout");
            if (!oFlexibleColumnLayout) {
                return;
            }

            var sBaseId = oFlexibleColumnLayout.getId();
            var oBeginColumn = document.getElementById(sBaseId + "-beginColumn");
            var oMidColumn = document.getElementById(sBaseId + "-midColumn");

            if (!oBeginColumn || !oMidColumn) {
                return;
            }

            if (this._bSidebarWidthCustomized) {
                return;
            }

            var sLayout = oFlexibleColumnLayout.getLayout();
            var bDesktop = window.innerWidth >= 1024;
            if (!bDesktop || sLayout !== "TwoColumnsMidExpanded") {
                this._clearSidebarColumnWidth();
                return;
            }

            // comment
            var nBeginWidth = 22;
            oBeginColumn.style.flex = "0 0 " + nBeginWidth + "%";
            oBeginColumn.style.maxWidth = nBeginWidth + "%";
            oBeginColumn.style.width = nBeginWidth + "%";
            oMidColumn.style.removeProperty("flex");
            oMidColumn.style.removeProperty("max-width");
            oMidColumn.style.removeProperty("width");
        },

        // comment
        _ensureCurrentConversation: function (bSilent) {
            var oModel = this.getView().getModel("chat");
            var sCurrentId = oModel.getProperty("/currentConversationId");

            if (sCurrentId) {
                return sCurrentId;
            }

            var aPendingAttachments = oModel.getProperty("/attachments") || [];

            this.onNewConversation(bSilent === undefined ? true : bSilent);
            sCurrentId = oModel.getProperty("/currentConversationId");

            if (aPendingAttachments.length > 0) {
                var aRestoredAttachments = aPendingAttachments.slice();
                oModel.setProperty("/attachments", aRestoredAttachments);
                this._updateCurrentConversationAttachments(aRestoredAttachments);
                this._renderAttachmentsFromModel();
            }

            return sCurrentId;
        },

        onNewConversation: function (vSilentFlag) {
            var oModel = this.getView().getModel("chat");
            var oI18n = this.getView().getModel("i18n").getResourceBundle();
            var sCurrentAiType = oModel.getProperty("/currentAiType");
            var bSilent = vSilentFlag === true;

            // comment
            var oNewConversation = {
                id: this._generateUUID(),
                title: oI18n.getText("newConversation"),
                messages: [],
                lastUpdate: this._formatDate(new Date()),
                sessionId: null,
                sessionInfo: null,  // initialized after first session response
                attachments: [],
                aiType: sCurrentAiType  // Ã¤Â¿ÂÃ¯Â¿Â½Ã¯Â¿Â½AIÃ§Â±Â»Ã¯Â¿Â½~9
            };

            // comment
            var aAllConversations = this.getOwnerComponent()._aAllConversations || [];
            aAllConversations.unshift(oNewConversation);
            this.getOwnerComponent()._aAllConversations = aAllConversations;

            // comment
            var aFilteredConversations = oModel.getProperty("/conversations") || [];
            aFilteredConversations.unshift(oNewConversation);
            oModel.setProperty("/conversations", aFilteredConversations);

            oModel.setProperty("/currentConversationId", oNewConversation.id);
            oModel.setProperty("/messages", []);
            this._setAttachmentsForConversation(oNewConversation);

            // comment
            this._clearMessageContainer();
            this._showWelcomeBox();

            // comment
            this.getOwnerComponent().saveConversationsToStorage();

            if (!bSilent) {
                MessageToast.show(oI18n.getText("newConversationCreated"));
            }
        },


        // comment
        onConversationSelect: function (oEvent) {
            var oContext;
            var oSource = oEvent.getSource();

            // comment
            if (oEvent.getParameter("listItem")) {
                // comment
                oContext = oEvent.getParameter("listItem").getBindingContext("chat");
            } else {
                // comment
                oContext = oSource.getBindingContext("chat");
            }

            if (oContext) {
                var oConversation = oContext.getObject();
                var oModel = this.getView().getModel("chat");

                // comment
                var aConversations = oModel.getProperty("/conversations") || [];
                var oFullConversation = aConversations.find(function (conv) {
                    return conv.id === oConversation.id;
                });

                if (oFullConversation) {
                    oModel.setProperty("/currentConversationId", oFullConversation.id);
                    // comment
                    var aMessages = JSON.parse(JSON.stringify(oFullConversation.messages || []));
                    oModel.setProperty("/messages", aMessages);
                    this._setAttachmentsForConversation(oFullConversation);

                    // comment
                    this._renderMessages();

                    // comment
                    if (aMessages.length > 0) {
                        this._hideWelcomeBox();
                    } else {
                        this._showWelcomeBox();
                    }

                    // comment
                    this._scrollToBottom();
                }
            }
        },

        // comment
        onEditConversationTitle: function (oEvent) {
            var that = this;
            var oSource = oEvent.getSource();
            var oContext = oSource.getBindingContext("chat");

            // comment
            if (this._bEditDialogOpen) {
                return;
            }

            if (oContext) {
                var oConversation = oContext.getObject();
                var sPath = oContext.getPath();

                this._bEditDialogOpen = true;

                // comment
                var oI18n = this.getView().getModel("i18n").getResourceBundle();

                sap.ui.require(["sap/m/Dialog", "sap/m/Input", "sap/m/Button"], function (Dialog, Input, Button) {
                    // comment
                    var oInput = new Input({
                        value: oConversation.title,
                        width: "100%",
                        placeholder: oI18n.getText("editTitle")
                    });

                    // comment
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

        // comment
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

                            // comment
                            aConversations = aConversations.filter(function (conv) {
                                return conv.id !== oConversation.id;
                            });

                            oModel.setProperty("/conversations", aConversations);

                            // comment
                            var aAllConversations = that.getOwnerComponent()._aAllConversations || [];
                            aAllConversations = aAllConversations.filter(function (conv) {
                                return conv.id !== oConversation.id;
                            });
                            that.getOwnerComponent()._aAllConversations = aAllConversations;

                            // comment
                            if (sCurrentId === oConversation.id) {
                                oModel.setProperty("/currentConversationId", null);
                                oModel.setProperty("/messages", []);
                                that._setAttachmentsForConversation(null);
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

        // comment
        onSendMessage: function () {
            var oModel = this.getView().getModel("chat");
            var oTextArea = this.byId("messageInput");

            // comment
            var sMessage = oTextArea ? oTextArea.getValue() : oModel.getProperty("/inputValue");
            var bIsLoading = oModel.getProperty("/isLoading");

            if (bIsLoading) {
                this._stopCurrentGeneration();
                return;
            }

            if (!sMessage || !sMessage.trim()) {
                return;
            }

            var sTrimmedMessage = sMessage.trim();
            if (sTrimmedMessage.length > CHAT_REQUEST_LIMITS.MAX_USER_MESSAGE_LENGTH) {
                MessageToast.show("æ¶ˆæ¯è¿‡é•¿ï¼Œè¯·ç²¾ç®€åŽé‡è¯•");
                return;
            }

            // comment
            oModel.setProperty("/inputValue", sTrimmedMessage);

            // comment
            this._ensureCurrentConversation(true);
            var oSendAttachmentPayload = this._extractReadyAttachmentsForSend();

            // comment
            var oUserMessage = {
                id: this._generateUUID(),
                role: "user",
                content: sTrimmedMessage,
                timestamp: new Date().toISOString(),
                attachments: oSendAttachmentPayload.attachments,
                attachmentContext: oSendAttachmentPayload.contextText || ""
            };

            var aMessages = oModel.getProperty("/messages") || [];
            aMessages.push(oUserMessage);
            oModel.setProperty("/messages", aMessages);

            // comment
            oModel.setProperty("/inputValue", "");
            if (oTextArea) {
                oTextArea.setValue("");
            }

            // comment
            this._hideWelcomeBox();

            // comment
            this._renderUserMessage(oUserMessage);

            // comment
            this._persistCurrentConversationState();

            // comment
            oModel.setProperty("/isLoading", true);

            // comment
            var oAIMessage = {
                id: this._generateUUID(),
                role: "assistant",
                content: "",
                timestamp: new Date().toISOString()
            };
            aMessages.push(oAIMessage);
            oModel.setProperty("/messages", aMessages);

            // comment
            this._renderAIMessageContainer(oAIMessage.id);

            // comment
            this._scrollToBottom();

            // comment
            this._callAIStream(sTrimmedMessage, oAIMessage.id, oUserMessage.attachmentContext);
        },

        _persistCurrentConversationState: function () {
            var oModel = this.getView().getModel("chat");
            var aMessages = oModel.getProperty("/messages") || [];
            var sCurrentId = oModel.getProperty("/currentConversationId");
            var aConversations = oModel.getProperty("/conversations") || [];
            var iConvIndex = aConversations.findIndex(function (conv) {
                return conv.id === sCurrentId;
            });

            if (iConvIndex < 0) {
                return;
            }

            aConversations[iConvIndex].messages = JSON.parse(JSON.stringify(aMessages));
            aConversations[iConvIndex].lastUpdate = this._formatDate(new Date());
            oModel.setProperty("/conversations", aConversations);
            this._syncToAllConversations(aConversations);
            this.getOwnerComponent().saveConversationsToStorage();
        },

        _stopCurrentGeneration: function () {
            var oModel = this.getView().getModel("chat");
            if (!oModel.getProperty("/isLoading")) {
                return;
            }

            this._abortActiveStreamRequest();
            oModel.setProperty("/isLoading", false);

            var aMessages = oModel.getProperty("/messages") || [];
            var oLastAssistantMsg = null;
            for (var i = aMessages.length - 1; i >= 0; i--) {
                if (aMessages[i].role === "assistant") {
                    oLastAssistantMsg = aMessages[i];
                    break;
                }
            }

            if (oLastAssistantMsg) {
                var sPartialContent = (oLastAssistantMsg.content || "").trim();
                if (sPartialContent) {
                    this._updateAIMessageContent(oLastAssistantMsg.id, sPartialContent, true);
                    this._finalizeAIMessage(oLastAssistantMsg.id, sPartialContent);
                } else {
                    aMessages = aMessages.filter(function (oMsg) {
                        return oMsg.id !== oLastAssistantMsg.id;
                    });
                    oModel.setProperty("/messages", aMessages);
                    var oContainer = document.getElementById("ai-msg-" + oLastAssistantMsg.id);
                    if (oContainer) {
                        oContainer.remove();
                    }
                    this._persistCurrentConversationState();
                }
            }

            var oI18n = this.getView().getModel("i18n").getResourceBundle();
            MessageToast.show(oI18n.getText("generationPaused"));
        },


        // comment
        // comment
        _SESSION_CONFIG: {
            MAX_ROUNDS: 50,        // upstream limit
            EXPIRE_HOURS: 1,       // upstream expiration in hours
            FALLBACK_ROUNDS: 10    // Ã¯Â¿Â½"Ã¯Â¿Â½Ã§ÂºÂ§Ã¯Â¿Â½Ã¯Â¿Â½Ã¤Â½Â¿Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½aÃ¯Â¿Â½} Ã¥ÂÂ²Ã¨Â½Â®Ã¯Â¿Â½"Ã¯Â¿Â½
        },

        /**
          *
          *
         */
        _callAIStream: function (sMessage, sMessageId, sAttachmentContext) {
            var that = this;
            var oModel = this.getView().getModel("chat");
            var oI18n = this.getView().getModel("i18n").getResourceBundle();
            var sCurrentId = oModel.getProperty("/currentConversationId");
            var aConversations = oModel.getProperty("/conversations") || [];
            var oCurrentConv = aConversations.find(function (conv) {
                return conv.id === sCurrentId;
            });

            if (oCurrentConv) {
                delete oCurrentConv._sessionIdSaved;
            }

            // comment
            var sSessionId = oCurrentConv ? oCurrentConv.sessionId : null;
            var oSessionInfo = oCurrentConv ? oCurrentConv.sessionInfo : null;

            // comment
            var aCurrentMessages = oModel.getProperty("/messages") || [];
            var sAiType = oModel.getProperty("/currentAiType");

            // comment
            var oRequestBody = this._buildRequestBody(sMessage, sSessionId, oSessionInfo, aCurrentMessages, sAiType, sAttachmentContext);

            var sFullContent = "";
            var sStreamError = "";
            var nLastRenderAt = 0;
            var RENDER_THROTTLE_MS = 80;
            this._abortActiveStreamRequest();
            var oAbortController = new AbortController();
            this._oActiveStreamController = oAbortController;

            var removeAssistantPlaceholder = function () {
                var aLatestMessages = oModel.getProperty("/messages") || [];
                aLatestMessages = aLatestMessages.filter(function (msg) {
                    return msg.id !== sMessageId;
                });
                oModel.setProperty("/messages", aLatestMessages);

                var oContainer = document.getElementById("ai-msg-" + sMessageId);
                if (oContainer) {
                    oContainer.remove();
                }

                that._persistCurrentConversationState();
            };

            var finalizeRequest = function () {
                if (that._oActiveStreamController !== oAbortController) {
                    return;
                }
                that._oActiveStreamController = null;
                if (!that._isExiting) {
                    oModel.setProperty("/isLoading", false);
                }
            };

            // comment
            fetch("/api/chat/stream", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(oRequestBody),
                signal: oAbortController.signal
            }).then(function (response) {
                if (!response.ok) {
                    return response.text().then(function (sRawError) {
                        var sBackendError = that._extractBackendErrorMessage(sRawError, oI18n.getText("networkError"));
                        throw new Error(sBackendError);
                    });
                }

                if (!response.body) {
                    throw new Error(oI18n.getText("streamNotSupported"));
                }

                return Utils.parseSSEStream(response, {
                    onData: function (oData) {
                        if (oData.error) {
                            if (!sStreamError) {
                                sStreamError = oData.error;
                                MessageToast.show(sStreamError);
                            }
                            return;
                        }

                        if (oData.text) {
                            sFullContent += oData.text;
                            var nNow = Date.now();
                            if (!that._isExiting && (nNow - nLastRenderAt >= RENDER_THROTTLE_MS)) {
                                that._updateAIMessageContent(sMessageId, sFullContent, false);
                                that._scrollToBottom();
                                nLastRenderAt = nNow;
                            }
                        }

                        if (oData.sessionId && oCurrentConv && !oCurrentConv._sessionIdSaved) {
                            var iIndex = aConversations.findIndex(function (c) {
                                return c.id === oCurrentConv.id;
                            });
                            if (iIndex >= 0) {
                                aConversations[iIndex].sessionId = oData.sessionId;
                                oCurrentConv._sessionIdSaved = true;
                                oModel.setProperty("/conversations", aConversations);
                            }
                        }
                    },
                    onDone: function () {
                        if (that._isExiting) {
                            finalizeRequest();
                            return;
                        }

                        if (sStreamError && !sFullContent) {
                            removeAssistantPlaceholder();
                            finalizeRequest();
                            return;
                        }

                        that._updateAIMessageContent(sMessageId, sFullContent, true);
                        that._finalizeAIMessage(sMessageId, sFullContent);
                        finalizeRequest();
                    },
                    onError: function (streamError) {
                        console.error("æµè¯»å–é”™è¯¯:", streamError);
                        if (that._isExiting) {
                            finalizeRequest();
                            return;
                        }
                        if (sFullContent) {
                            that._updateAIMessageContent(sMessageId, sFullContent, true);
                            that._finalizeAIMessage(sMessageId, sFullContent);
                        } else {
                            removeAssistantPlaceholder();
                        }
                        finalizeRequest();
                        MessageToast.show(oI18n.getText("connectionInterrupted"));
                    }
                });
            }).catch(function (error) {
                if (error && error.name === "AbortError") {
                    finalizeRequest();
                    return;
                }
                console.error("AIè°ƒç”¨é”™è¯¯:", error);
                if (!that._isExiting) {
                    MessageToast.show((error && error.message) ? error.message : oI18n.getText("aiServiceUnavailable"));
                }
                finalizeRequest();

                // comment
                if (that._isExiting) {
                    return;
                }
                removeAssistantPlaceholder();
            });
        },

        // comment
        _renderUserMessage: function (oMessage) {
            var that = this;
            var oMessageList = this.byId("messageList");
            var oDomRef = oMessageList.getDomRef();

            // comment
            if (!oDomRef) {
                this._setManagedTimeout(function () {
                    that._renderUserMessage(oMessage);
                }, 100);
                return;
            }

            // comment
            var sAttachmentStripHtml = this._buildMessageAttachmentStripHtml(oMessage.attachments);
            var sHtml = '<div class="messageItem userMessage" id="user-msg-' + oMessage.id + '">' +
                '<div class="avatarContainer">' +
                '<img class="avatarImage userAvatarImg" src="images/user_avatar_1772638105594.png" alt="User Avatar">' +
                '</div>' +
                '<div class="messageContent">' +
                '<div class="messageText">' + Utils.escapeHtml(oMessage.content) + '</div>' +
                sAttachmentStripHtml +
                '</div>' +
                '</div>';

            oDomRef.insertAdjacentHTML("beforeend", sHtml);
        },

        _buildMessageAttachmentStripHtml: function (aAttachments) {
            if (!Array.isArray(aAttachments) || aAttachments.length === 0) {
                return "";
            }

            var that = this;
            var aChips = aAttachments.map(function (oAttachment) {
                var sName = Utils.escapeHtml(oAttachment.fileName || "attachment");
                var sExt = Utils.escapeHtml((oAttachment.fileExt || "").toUpperCase());
                var sSize = oAttachment.fileSize ? Utils.escapeHtml(that._formatFileSize(oAttachment.fileSize)) : "";
                var sMeta = "";

                if (sSize && sExt) {
                    sMeta = sSize + " Ãƒâ€šÃ‚Â· " + sExt;
                } else if (sSize) {
                    sMeta = sSize;
                } else if (sExt) {
                    sMeta = sExt;
                }

                return '<span class="messageAttachmentChip" title="' + sName + '">' +
                    '<span class="chipPin"></span>' +
                    '<span class="chipName">' + sName + '</span>' +
                    (sMeta ? '<span class="chipMeta">' + sMeta + '</span>' : '') +
                    '</span>';
            });

            return '<div class="messageAttachmentStrip">' + aChips.join("") + '</div>';
        },

        // comment
        _renderAIMessageContainer: function (sMessageId) {
            var that = this;
            var oMessageList = this.byId("messageList");
            var oDomRef = oMessageList.getDomRef();

            // comment
            if (!oDomRef) {
                this._setManagedTimeout(function () {
                    that._renderAIMessageContainer(sMessageId);
                }, 100);
                return;
            }

            var sHtml = '<div class="messageItem aiMessage" id="ai-msg-' + sMessageId + '">' +
                '<div class="avatarContainer">' +
                '<img class="avatarImage aiAvatarImg" src="images/ai_avatar_1772638017386.png" alt="AI Avatar">' +
                '</div>' +
                '<div class="messageContent">' +
                '<div class="messageText" id="ai-text-' + sMessageId + '">' +
                '<div class="typingIndicator"><span></span><span></span><span></span></div>' +
                '</div>' +
                '<div class="messageActionArea" id="ai-actions-' + sMessageId + '"></div>' +
                '</div>' +
                '</div>';

            oDomRef.insertAdjacentHTML("beforeend", sHtml);

            // Add a copy button area for assistant messages
            var oActionArea = document.getElementById("ai-actions-" + sMessageId);
            if (oActionArea) {
                var oI18n = this.getView().getModel("i18n").getResourceBundle();
                var sCopyText = oI18n.getText("copy");
                var sCopiedText = oI18n.getText("copied");
                var sCopyFailedText = oI18n.getText("copyFailed");

                var oCopyMsgBtn = document.createElement("button");
                oCopyMsgBtn.className = "copyMessageBtn";
                oCopyMsgBtn.title = sCopyText;
                // SAP-icons: &#xe0ec; (copy)
                oCopyMsgBtn.innerHTML = '<span class="sapUiIcon" style="font-family: SAP-icons">&#xe0ec;</span> ' + sCopyText;

                oCopyMsgBtn.onclick = function () {
                    var sFullText = "";
                    var oModel = that.getView().getModel("chat");
                    var aMessages = oModel.getProperty("/messages") || [];
                    var oTargetMessage = aMessages.find(function (msg) { return msg.id === sMessageId; });
                    if (oTargetMessage && oTargetMessage.content) {
                        sFullText = oTargetMessage.content;
                    } else {
                        var oTextEl = document.getElementById("ai-text-" + sMessageId);
                        sFullText = oTextEl ? oTextEl.innerText : "";
                    }

                    if (sFullText) {
                        Utils.copyTextToClipboard(sFullText).then(function () {
                            oCopyMsgBtn.innerHTML = '<span class="sapUiIcon" style="font-family: SAP-icons">&#xe05b;</span> ' + sCopiedText;
                            that._setManagedTimeout(function () {
                                oCopyMsgBtn.innerHTML = '<span class="sapUiIcon" style="font-family: SAP-icons">&#xe0ec;</span> ' + sCopyText;
                            }, 2000);
                        }).catch(function () {
                            MessageToast.show(sCopyFailedText);
                        });
                    }
                };

                oActionArea.appendChild(oCopyMsgBtn);
            }
        },

        // comment
        _updateAIMessageContent: function (sMessageId, sContent, bFinalize) {
            var oModel = this.getView().getModel("chat");
            var aMessages = oModel.getProperty("/messages") || [];
            var oMessage = aMessages.find(function (msg) {
                return msg.id === sMessageId;
            });
            if (oMessage) {
                oMessage.content = sContent;
            }

            var oTextElement = document.getElementById("ai-text-" + sMessageId);

            if (oTextElement) {
                // comment
                var sRenderedContent = this._renderMarkdown(sContent);
                oTextElement.innerHTML = sRenderedContent;

                if (bFinalize !== false) {
                    // comment
                    this._highlightCode(oTextElement);

                    // comment
                    this._addCopyButtons(oTextElement);
                }
            }
        },


        // comment
        _finalizeAIMessage: function (sMessageId, sContent) {
            var oModel = this.getView().getModel("chat");
            var aMessages = oModel.getProperty("/messages") || [];
            var sCurrentId = oModel.getProperty("/currentConversationId");

            // comment
            var oMessage = aMessages.find(function (msg) {
                return msg.id === sMessageId;
            });

            if (oMessage) {
                oMessage.content = sContent;
            }

            // comment
            var aConversations = oModel.getProperty("/conversations") || [];
            var iConvIndex = aConversations.findIndex(function (conv) {
                return conv.id === sCurrentId;
            });

            if (iConvIndex >= 0) {
                // comment
                aConversations[iConvIndex].messages = JSON.parse(JSON.stringify(aMessages));
                aConversations[iConvIndex].lastUpdate = this._formatDate(new Date());

                // comment
                if (aConversations[iConvIndex].sessionId) {
                    if (!aConversations[iConvIndex].sessionInfo) {
                        // comment
                        aConversations[iConvIndex].sessionInfo = {
                            createdAt: new Date().toISOString(),
                            roundCount: 1
                        };
                    } else {
                        // comment
                        aConversations[iConvIndex].sessionInfo.roundCount++;
                    }
                    console.log("[AI] å½“å‰è½®æ¬¡: " + aConversations[iConvIndex].sessionInfo.roundCount);
                }

                // comment
                delete aConversations[iConvIndex]._sessionIdSaved;

                // comment
                var oI18n = this.getView().getModel("i18n").getResourceBundle();
                var sNewConvTitle = oI18n.getText("newConversation");
                if (aMessages.length <= 2 && aConversations[iConvIndex].title === sNewConvTitle) {
                    var sFirstUserMsg = aMessages[0] ? aMessages[0].content : "";
                    aConversations[iConvIndex].title = sFirstUserMsg.substring(0, 20) + (sFirstUserMsg.length > 20 ? "..." : "");
                }
            }

            // comment
            oModel.setProperty("/conversations", aConversations);
            oModel.setProperty("/messages", aMessages);

            // comment
            this._syncToAllConversations(aConversations);

            // comment
            this.getOwnerComponent().saveConversationsToStorage();
        },

        /**
          *
          *
         */
        _syncToAllConversations: function (aFilteredConversations) {
            var aAllConversations = this.getOwnerComponent()._aAllConversations || [];

            // comment
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

        // comment
        _renderMarkdown: function (sContent) {
            if (typeof marked !== "undefined") {
                // comment
                marked.setOptions({
                    breaks: true,
                    gfm: true
                });
                var sSafeContent = Utils.escapeHtml(sContent);
                return marked.parse(sSafeContent);
            }
            return Utils.escapeHtml(sContent);
        },

        // comment
        _highlightCode: function (oElement) {
            if (typeof hljs !== "undefined") {
                var aCodeBlocks = oElement.querySelectorAll("pre code");
                aCodeBlocks.forEach(function (block) {
                    hljs.highlightElement(block);
                });
            }
        },


        // comment
        _addCopyButtons: function (oElement) {
            var that = this;
            var aPreBlocks = oElement.querySelectorAll("pre");
            var oI18n = this.getView().getModel("i18n").getResourceBundle();
            var sCopyText = oI18n.getText("copy");
            var sCopiedText = oI18n.getText("copied");
            var sCopyFailedText = oI18n.getText("copyFailed");

            aPreBlocks.forEach(function (pre) {
                // comment
                if (pre.parentNode && pre.parentNode.classList && pre.parentNode.classList.contains("codeBlockWrapper")) {
                    return;
                }

                // comment
                var oCopyBtn = document.createElement("button");
                oCopyBtn.className = "copyButton";
                // comment
                oCopyBtn.innerHTML = '<span class="sapUiIcon" style="font-family: SAP-icons">&#xe0ec;</span> ' + sCopyText;
                oCopyBtn.onclick = function () {
                    var sCode = pre.querySelector("code") ? pre.querySelector("code").textContent : pre.textContent;
                    Utils.copyTextToClipboard(sCode).then(function () {
                        // comment
                        oCopyBtn.innerHTML = '<span class="sapUiIcon" style="font-family: SAP-icons">&#xe05b;</span> ' + sCopiedText;
                        that._setManagedTimeout(function () {
                            oCopyBtn.innerHTML = '<span class="sapUiIcon" style="font-family: SAP-icons">&#xe0ec;</span> ' + sCopyText;
                        }, 2000);
                    }).catch(function () {
                        MessageToast.show(sCopyFailedText);
                    });
                };

                // comment
                var oWrapper = document.createElement("div");
                oWrapper.className = "codeBlockWrapper";
                pre.parentNode.insertBefore(oWrapper, pre);
                oWrapper.appendChild(pre);
                oWrapper.appendChild(oCopyBtn);
            });
        },

        // comment
        _renderMessages: function () {
            var that = this;
            var oModel = this.getView().getModel("chat");
            var aMessages = oModel.getProperty("/messages") || [];

            // comment
            this._clearMessageContainer();

            // comment
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

        // comment
        _clearMessageContainer: function () {
            var oMessageList = this.byId("messageList");
            var oDomRef = oMessageList.getDomRef();

            if (oDomRef) {
                oDomRef.innerHTML = "";
            }
        },

        // comment
        _scrollToBottom: function () {
            var oScrollContainer = this.byId("messageScrollContainer");

            if (oScrollContainer) {
                this._setManagedTimeout(function () {
                    var oDomRef = oScrollContainer.getDomRef();
                    if (oDomRef) {
                        oDomRef.scrollTop = oDomRef.scrollHeight;
                    }
                }, 100);
            }
        },

        /**
          *
          *
          *
          *
          *
          *
          *
          *
         */
        _buildRequestBody: function (sMessage, sSessionId, oSessionInfo, aMessages, sAiType, sAttachmentContext) {
            var bUseSessionId = this._shouldUseSessionId(sSessionId, oSessionInfo);

            // comment
            var sContextText = sAttachmentContext || this._getReadySessionParsedTexts();
            var sFinalMessage = this._buildPromptWithContext(sMessage, sContextText);

            if (sContextText) {
                console.log("[AI] é™„åŠ äº†å‰ç«¯è§£æžä¸Šä¸‹æ–‡ï¼ŒåŽŸå§‹é•¿åº¦: " + sContextText.length + "ï¼Œæœ€ç»ˆPrompté•¿åº¦: " + sFinalMessage.length);
            }

            if (bUseSessionId) {
                // comment
                console.log("[AI] ä½¿ç”¨ session_id æ¨¡å¼");
                return {
                    message: sFinalMessage,
                    sessionId: sSessionId,
                    sessionInfo: oSessionInfo,
                    aiType: sAiType
                };
            } else if (aMessages && aMessages.length > 2) {
                // comment
                console.log("[AI] ä½¿ç”¨ messages æ¨¡å¼ï¼ˆé™çº§ï¼‰");
                var aHistoryMessages = this._buildMessagesArray(aMessages);
                return {
                    message: sFinalMessage,
                    messages: aHistoryMessages,
                    sessionInfo: oSessionInfo,
                    aiType: sAiType
                };
            } else {
                // comment
                console.log("[AI] æ–°å¯¹è¯æ¨¡å¼");
                return {
                    message: sFinalMessage,
                    aiType: sAiType
                };
            }
        },

        /**
          *
          *
          *
          *
         */
        _buildPromptWithContext: function (sMessage, sContextText) {
            var sSafeMessage = typeof sMessage === "string" ? sMessage : "";
            var sSafeContext = typeof sContextText === "string" ? sContextText : "";
            var nPromptLimit = CHAT_REQUEST_LIMITS.MAX_PROMPT_LENGTH;

            if (!sSafeContext) {
                return sSafeMessage.slice(0, nPromptLimit);
            }

            var sPrefix = "åŸºäºŽä»¥ä¸‹å‚è€ƒèµ„æ–™ï¼š\n\n";
            var sMiddle = "\n\n--- èµ„æ–™ç»“æŸ ---\n\nç”¨æˆ·é—®é¢˜ï¼š\n";
            var nAvailableContext = nPromptLimit - sPrefix.length - sMiddle.length - sSafeMessage.length;

            if (nAvailableContext <= 0) {
                return sSafeMessage.slice(0, nPromptLimit);
            }

            var sTrimmedContext = sSafeContext.length > nAvailableContext ? sSafeContext.slice(0, nAvailableContext) : sSafeContext;
            return sPrefix + sTrimmedContext + sMiddle + sSafeMessage;
        },

        _extractBackendErrorMessage: function (sRawError, sFallback) {
            var sDefaultText = sFallback || "è¯·æ±‚å¤±è´¥ï¼Œè¯·ç¨åŽé‡è¯•";
            if (!sRawError) {
                return sDefaultText;
            }

            var sRawText = String(sRawError).trim();
            if (!sRawText) {
                return sDefaultText;
            }

            try {
                var oPayload = JSON.parse(sRawText);
                var sPayloadError = oPayload && typeof oPayload.error === "string" ? oPayload.error.trim() : "";
                if (sPayloadError) {
                    return sPayloadError;
                }
            } catch {
                // ignore parse error and fallback to plain text
            }

            return sRawText;
        },

        _shouldUseSessionId: function (sSessionId, oSessionInfo) {
            if (!sSessionId) {
                return false;
            }

            if (!oSessionInfo) {
                // comment
                return true;
            }

            // comment
            if (oSessionInfo.roundCount >= this._SESSION_CONFIG.MAX_ROUNDS) {
                console.log("[AI] session_id å·²è¾¾è½®æ¬¡ä¸Šé™ï¼Œåˆ‡æ¢åˆ° messages æ¨¡å¼");
                return false;
            }

            // comment
            if (oSessionInfo.createdAt) {
                var nCreatedTime = new Date(oSessionInfo.createdAt).getTime();
                var nNow = Date.now();
                var nExpireTime = this._SESSION_CONFIG.EXPIRE_HOURS * 60 * 60 * 1000;

                if (nNow - nCreatedTime > nExpireTime) {
                    console.log("[AI] session_id å·²è¿‡æœŸï¼Œåˆ‡æ¢åˆ° messages æ¨¡å¼");
                    return false;
                }
            }

            return true;
        },

        /**
          *
          *
          *
          *
         */
        _buildMessagesArray: function (aMessages) {
            // comment
            var aHistory = aMessages.slice(0, -2);
            var that = this;

            // comment
            var nMaxRounds = this._SESSION_CONFIG.FALLBACK_ROUNDS;
            var nMaxMessages = nMaxRounds * 2;  // Ã¦Â¯ÂÃ¨Â½Â®Ã¯Â¿Â½R&Ã¥ÂÂ«Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã†Â·Ã¯Â¿Â½RAIÃ¯Â¿Â½Ã¤Â¸Â¬Ã¦ÂÂ¡
            if (aHistory.length > nMaxMessages) {
                aHistory = aHistory.slice(-nMaxMessages);
            }

            // comment
            return aHistory.filter(function (msg) {
                return msg.content;  // Ã¯Â¿Â½!Ã¦Â»Â¤Ã§Â©ÂºÃ¯Â¿Â½ &Ã¥Â®Â¹
            }).map(function (msg) {
                var sContent = msg.content;
                if (msg.role === "user" && msg.attachmentContext) {
                    sContent = that._buildPromptWithContext(sContent, msg.attachmentContext);
                }
                // comment
                if (msg.role === "assistant" && sContent.length > 1000) {
                    sContent = sContent.substring(0, 1000) + "...";
                }
                return {
                    role: msg.role,
                    content: sContent
                };
            });
        },

        // comment
        _generateUUID: function () {
            return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
                var r = Math.random() * 16 | 0;
                var v = c === "x" ? r : (r & 0x3 | 0x8);
                return v.toString(16);
            });
        },

        // comment
        _formatDate: function (oDate) {
            var sYear = oDate.getFullYear();
            var sMonth = String(oDate.getMonth() + 1).padStart(2, "0");
            var sDay = String(oDate.getDate()).padStart(2, "0");
            var sHour = String(oDate.getHours()).padStart(2, "0");
            var sMinute = String(oDate.getMinutes()).padStart(2, "0");

            return sYear + "-" + sMonth + "-" + sDay + " " + sHour + ":" + sMinute;
        },

        _setManagedTimeout: function (fnCallback, nDelay) {
            var that = this;
            var iTimer = setTimeout(function () {
                that._pendingTimeouts.delete(iTimer);
                if (that._isExiting) {
                    return;
                }
                fnCallback();
            }, nDelay);
            this._pendingTimeouts.add(iTimer);
            return iTimer;
        },

        _clearManagedTimeout: function (iTimer) {
            if (!iTimer) {
                return;
            }
            clearTimeout(iTimer);
            this._pendingTimeouts.delete(iTimer);
        },

        _clearAllManagedTimeouts: function () {
            this._pendingTimeouts.forEach(function (iTimer) {
                clearTimeout(iTimer);
            });
            this._pendingTimeouts.clear();
        },

        _abortActiveStreamRequest: function () {
            if (this._oActiveStreamController) {
                this._oActiveStreamController.abort();
                this._oActiveStreamController = null;
            }
        },

        // comment
        _hideWelcomeBox: function () {
            var oWelcomeBox = this.byId("welcomeBox");
            if (oWelcomeBox) {
                oWelcomeBox.setVisible(false);
            }
        },

        // comment
        _showWelcomeBox: function () {
            var oWelcomeBox = this.byId("welcomeBox");
            if (oWelcomeBox) {
                oWelcomeBox.setVisible(true);
            }
        },

        _setAttachmentsForConversation: function (oConversation) {
            var oModel = this.getView().getModel("chat");
            if (oConversation && !Array.isArray(oConversation.attachments)) {
                oConversation.attachments = [];
            }
            var aAttachments = oConversation ? oConversation.attachments : [];

            oModel.setProperty("/attachments", aAttachments);
            this._renderAttachmentsFromModel();
        },

        _renderAttachmentsFromModel: function () {
            var oModel = this.getView().getModel("chat");
            var aAttachments = oModel.getProperty("/attachments") || [];

            this._clearAttachmentDom();
            aAttachments.forEach(function (oAttachment) {
                this._renderAttachmentCard(oAttachment);
            }.bind(this));

            this._updateAttachmentAreaVisibility();
        },

        _clearAttachmentDom: function () {
            var oAttachmentList = this.byId("attachmentList");
            if (oAttachmentList) {
                var oDomRef = oAttachmentList.getDomRef();
                if (oDomRef) {
                    oDomRef.innerHTML = "";
                }
            }
        },

        _updateCurrentConversationAttachments: function (aAttachments) {
            var oModel = this.getView().getModel("chat");
            var sCurrentId = oModel.getProperty("/currentConversationId");
            if (!sCurrentId) {
                return;
            }

            var aConversations = oModel.getProperty("/conversations") || [];
            var iIndex = aConversations.findIndex(function (conv) {
                return conv.id === sCurrentId;
            });

            if (iIndex >= 0) {
                aConversations[iIndex].attachments = aAttachments;
                oModel.setProperty("/conversations", aConversations);
                this._syncToAllConversations(aConversations);
            }
        },


        // comment

        /**
          *
         */
        _bindFileInputChange: function () {
            var that = this;

            // comment
            this._setManagedTimeout(function () {
                var oFileInput = document.getElementById("hiddenFileInput");
                if (!oFileInput) {
                    return;
                }

                if (!that._fnFileInputChange) {
                    that._fnFileInputChange = function (oEvent) {
                        that._handleFileSelect(oEvent);
                    };
                }

                if (that._oBoundFileInput && that._oBoundFileInput !== oFileInput) {
                    that._oBoundFileInput.removeEventListener("change", that._fnFileInputChange);
                    that._oBoundFileInput = null;
                }

                if (that._oBoundFileInput !== oFileInput) {
                    oFileInput.addEventListener("change", that._fnFileInputChange);
                    that._oBoundFileInput = oFileInput;
                }
            }, 500);
        },

        /**
         * Click upload button and trigger the native file input
         */
        onUploadFile: function () {
            var oModel = this.getView().getModel("chat");
            var aAttachments = oModel.getProperty("/attachments") || [];
            var oI18n = this.getView().getModel("i18n").getResourceBundle();

            // comment
            if (aAttachments.length >= FILE_UPLOAD_CONFIG.MAX_FILES_PER_SESSION) {
                MessageToast.show(oI18n.getText("maxFilesReached") || "æœ€å¤šåªå…è®¸ä¸Šä¼  " + FILE_UPLOAD_CONFIG.MAX_FILES_PER_SESSION + " ä¸ªæ–‡ä»¶");
                return;
            }

            var oFileInput = document.getElementById("hiddenFileInput");
            if (oFileInput) {
                oFileInput.value = "";  // Ã¯Â¿Â½&Ã§Â©ÂºÃ¤Â»Â¥Ã¯Â¿Â½&Ã¯Â¿Â½Ã¨Â®Â¸Ã¯Â¿Â½!Ã¯Â¿Â½Ã¥Â¤ÂÃ¯Â¿Â½0Ã¯Â¿Â½9Ã¯Â¿Â½Ã¯Â¿Â½RÃ¤Â¸Â¬Ã¯Â¿Â½!Ã¤Â»Â¶
                oFileInput.click();
            }
        },

        /**
          *
         */
        _handleFileSelect: function (oEvent) {
            var oFile = oEvent.target.files[0];
            var oModel = this.getView().getModel("chat");
            var oI18n = this.getView().getModel("i18n").getResourceBundle();

            if (!oFile) {
                return;
            }

            // Ensure a conversation exists so attachments are retained for first message.
            this._ensureCurrentConversation(true);

            // comment
            if (oFile.size > FILE_UPLOAD_CONFIG.MAX_FILE_SIZE) {
                MessageBox.error(
                    (oI18n.getText("fileTooLarge") || "æ–‡ä»¶è¿‡å¤§") +
                    "ï¼Œæœ€å¤§å…è®¸ä¸º " + this._formatFileSize(FILE_UPLOAD_CONFIG.MAX_FILE_SIZE)
                );
                return;
            }

            // comment
            var sFileName = oFile.name || "";
            var nLastDot = sFileName.lastIndexOf(".");
            var sExt = nLastDot >= 0 ? sFileName.substring(nLastDot).toLowerCase() : "";
            if (!sExt || !FILE_UPLOAD_CONFIG.ALLOWED_EXTENSIONS.includes(sExt)) {
                MessageBox.error(
                    (oI18n.getText("unsupportedFileType") || "ä¸æ”¯æŒçš„æ–‡ä»¶ç±»åž‹") + ": " + (sExt || sFileName || "unknown")
                );
                return;
            }

            // comment
            var oAttachment = {
                id: this._generateUUID(),
                file: oFile,
                fileName: oFile.name,
                fileSize: oFile.size,
                fileExt: sExt.substring(1),
                status: 'uploading',
                progress: 0,
                fileId: null,
                message: oI18n.getText("uploading") || "ä¸Šä¼ ä¸­..."
            };

            // comment
            var aAttachments = oModel.getProperty("/attachments") || [];
            aAttachments.push(oAttachment);
            oModel.setProperty("/attachments", aAttachments);
            this._updateCurrentConversationAttachments(aAttachments);

            // comment
            this._renderAttachmentCard(oAttachment);

            // comment
            this._updateAttachmentAreaVisibility();

            // comment
            this._uploadFile(oAttachment);
        },

        /**
          *
         */
        _loadScript: function (sUrl, sGlobalVar) {
            return new Promise(function (resolve, reject) {
                if (window[sGlobalVar]) {
                    resolve(window[sGlobalVar]);
                    return;
                }
                var script = document.createElement('script');
                script.src = sUrl;
                script.onload = function () { resolve(window[sGlobalVar]); };
                script.onerror = function () { reject(new Error("åŠ è½½è„šæœ¬å¤±è´¥: " + sUrl)); };
                document.head.appendChild(script);
            });
        },

        /**
         * Upload flow uses local frontend parsing instead of backend parsing
         */
        _uploadFile: function (oAttachment) {
            var that = this;
            var oI18n = this.getView().getModel("i18n").getResourceBundle();

            that._updateAttachmentCard(oAttachment.id, {
                status: 'processing',
                progress: 50,
                message: oI18n.getText("parsing") || "è§£æžä¸­..."
            });
            that._updateAttachmentInModel(oAttachment.id, {
                status: 'processing'
            });

            this._parseFileLocally(oAttachment.file, oAttachment.fileExt)
                .then(function (sParsedText) {
                    that._updateAttachmentCard(oAttachment.id, {
                        status: 'ready',
                        progress: 100,
                        message: oI18n.getText("ready") || "å·²å°±ç»ª"
                    });
                    that._updateAttachmentInModel(oAttachment.id, {
                        status: 'ready',
                        parsedText: sParsedText
                    });
                    MessageToast.show(oAttachment.fileName + " " + (oI18n.getText("parseComplete") || "è§£æžå®Œæˆ"));
                })
                .catch(function (error) {
                    console.error("[FileParse] å‰ç«¯è§£æžé”™è¯¯:", error);
                    that._updateAttachmentCard(oAttachment.id, {
                        status: 'error',
                        progress: 0,
                        message: error.message || "è§£æžå¤±è´¥"
                    });
                    that._updateAttachmentInModel(oAttachment.id, {
                        status: 'error',
                        message: error.message
                    });
                    MessageToast.show(error.message || "æ–‡ä»¶è§£æžå¤±è´¥");
                });
        },

        /**
          *
         */
        _parseFileLocally: function (oFile, sExt) {
            var that = this;
            return new Promise(function (resolve, reject) {
                var reader = new FileReader();

                var textExtensions = ['txt', 'md', 'json', 'csv', 'xml'];
                if (textExtensions.indexOf(sExt) !== -1) {
                    reader.onload = function (e) { resolve(e.target.result); };
                    reader.onerror = reject;
                    reader.readAsText(oFile);
                } else if (sExt === 'pdf') {
                    that._loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js', 'pdfjsLib')
                        .then(function (pdfjsLib) {
                            pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
                            reader.onload = function (e) {
                                var typedarray = new Uint8Array(e.target.result);
                                pdfjsLib.getDocument(typedarray).promise.then(function (pdf) {
                                    var maxPages = pdf.numPages;
                                    var countPromises = [];
                                    for (var j = 1; j <= maxPages; j++) {
                                        countPromises.push(
                                            pdf.getPage(j).then(function (page) {
                                                return page.getTextContent().then(function (text) {
                                                    return text.items.map(function (s) { return s.str; }).join('');
                                                });
                                            })
                                        );
                                    }
                                    Promise.all(countPromises).then(function (texts) {
                                        resolve(texts.join('\n'));
                                    }).catch(reject);
                                }).catch(reject);
                            };
                            reader.onerror = reject;
                            reader.readAsArrayBuffer(oFile);
                        }).catch(reject);
                } else if (sExt === 'docx') {
                    that._loadScript('https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js', 'mammoth')
                        .then(function (mammoth) {
                            reader.onload = function (e) {
                                var arrayBuffer = e.target.result;
                                mammoth.extractRawText({ arrayBuffer: arrayBuffer })
                                    .then(function (result) { resolve(result.value); })
                                    .catch(reject);
                            };
                            reader.onerror = reject;
                            reader.readAsArrayBuffer(oFile);
                        }).catch(reject);
                } else if (sExt === 'xlsx' || sExt === 'xls') {
                    that._loadScript('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js', 'XLSX')
                        .then(function (XLSX) {
                            reader.onload = function (e) {
                                var data = new Uint8Array(e.target.result);
                                var workbook = XLSX.read(data, { type: 'array' });
                                var sText = "";
                                workbook.SheetNames.forEach(function (sheetName) {
                                    var roa = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 });
                                    if (roa.length) {
                                        var rowsText = roa.map(function (row) { return row.join(','); }).join('\n');
                                        sText += "Sheet: " + sheetName + "\n" + rowsText + "\n\n";
                                    }
                                });
                                resolve(sText);
                            };
                            reader.onerror = reject;
                            reader.readAsArrayBuffer(oFile);
                        }).catch(reject);
                } else {
                    reject(new Error("ä¸æ”¯æŒåœ¨æµè§ˆå™¨ä¸­ç›´æŽ¥è§£æžæ­¤ç±»åž‹çš„æ–‡ä»¶: " + sExt));
                }
            });
        },

        /**
          *
         */
        _renderAttachmentCard: function (oAttachment) {
            var that = this;
            var oAttachmentList = this.byId("attachmentList");

            if (!oAttachmentList) {
                return;
            }

            var oDomRef = oAttachmentList.getDomRef();
            if (!oDomRef) {
                this._setManagedTimeout(function () {
                    that._renderAttachmentCard(oAttachment);
                }, 100);
                return;
            }

            var oIconInfo = this._getFileTypeIcon(oAttachment.fileExt);
            var sProgressClass = oAttachment.status === 'ready' ? 'complete' : '';
            var sSafeFileName = Utils.escapeHtml(oAttachment.fileName || "");
            var sSafeMessage = Utils.escapeHtml(oAttachment.message || "");
            var sIndeterminate = oAttachment.status === 'processing' ? 'indeterminate' : '';

            var sHtml = '<div class="fileCard" id="file-card-' + oAttachment.id + '">' +
                '<div class="fileIconContainer ' + oIconInfo.class + '">' +
                '<span class="sapUiIcon fileIcon" style="font-family: SAP-icons">' + oIconInfo.icon + '</span>' +
                '</div>' +
                '<div class="fileInfo">' +
                '<span class="fileName" title="' + sSafeFileName + '">' + sSafeFileName + '</span>' +
                '<span class="fileStatus ' + oAttachment.status + '" id="file-status-' + oAttachment.id + '">' +
                sSafeMessage +
                '</span>' +
                '<div class="progressBarContainer ' + sIndeterminate + '" id="file-progress-container-' + oAttachment.id + '">' +
                '<div class="progressBar ' + sProgressClass + '" id="file-progress-' + oAttachment.id + '" style="width: ' + oAttachment.progress + '%"></div>' +
                '</div>' +
                '</div>' +
                '<button class="fileDeleteBtn" id="file-delete-' + oAttachment.id + '" title="ÃƒÂ¥Ã‹â€  ÃƒÂ©Ã¢â€žÂ¢Ã‚Â¤">' +
                '<span class="sapUiIcon deleteIcon" style="font-family: SAP-icons">&#xe03e;</span>' +
                '</button>' +
                '</div>';

            oDomRef.insertAdjacentHTML("beforeend", sHtml);

            // comment
            var oDeleteBtn = document.getElementById("file-delete-" + oAttachment.id);
            if (oDeleteBtn) {
                oDeleteBtn.addEventListener("click", function () {
                    that._removeAttachment(oAttachment.id);
                });
            }
        },

        /**
          *
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
          *
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
                this._updateCurrentConversationAttachments(aAttachments);
            }
        },

        /**
          *
         */
        _removeAttachment: function (sAttachmentId) {
            var oModel = this.getView().getModel("chat");
            var aAttachments = oModel.getProperty("/attachments") || [];

            // comment
            aAttachments = aAttachments.filter(function (a) {
                return a.id !== sAttachmentId;
            });
            oModel.setProperty("/attachments", aAttachments);
            this._updateCurrentConversationAttachments(aAttachments);

            // comment
            var oCardEl = document.getElementById("file-card-" + sAttachmentId);
            if (oCardEl) {
                oCardEl.remove();
            }

            // comment
            this._updateAttachmentAreaVisibility();
        },

        /**
          *
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
          *
         */
        _getFileTypeIcon: function (sExt) {
            var sLowerExt = (sExt || '').toLowerCase();
            return FILE_TYPE_ICONS[sLowerExt] || FILE_TYPE_ICONS['default'];
        },

        /**
          *
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

        _extractReadyAttachmentsForSend: function () {
            var oModel = this.getView().getModel("chat");
            var aAttachments = oModel.getProperty("/attachments") || [];
            var aReadyAttachments = [];
            var aRemainingAttachments = [];
            var aContextBlocks = [];

            aAttachments.forEach(function (oAttachment) {
                if (oAttachment.status === "ready") {
                    aReadyAttachments.push({
                        id: oAttachment.id,
                        fileName: oAttachment.fileName,
                        fileSize: oAttachment.fileSize,
                        fileExt: oAttachment.fileExt
                    });

                    if (oAttachment.parsedText) {
                        aContextBlocks.push("ã€æ–‡ä»¶ï¼š" + oAttachment.fileName + "ã€‘\n" + oAttachment.parsedText);
                    }
                } else {
                    aRemainingAttachments.push(oAttachment);
                }
            });

            if (aReadyAttachments.length > 0) {
                oModel.setProperty("/attachments", aRemainingAttachments);
                this._updateCurrentConversationAttachments(aRemainingAttachments);
                this._renderAttachmentsFromModel();
                this._updateAttachmentAreaVisibility();
            }

            return {
                attachments: aReadyAttachments,
                contextText: aContextBlocks.join("\n\n").trim()
            };
        },

        /**
          *
         */
        _getReadySessionParsedTexts: function () {
            var oModel = this.getView().getModel("chat");
            var aAttachments = oModel.getProperty("/attachments") || [];
            var sContext = "";

            aAttachments.forEach(function (a) {
                if (a.status === 'ready' && a.parsedText) {
                    sContext += "ã€æ–‡ä»¶ï¼š" + a.fileName + "ã€‘\n" + a.parsedText + "\n\n";
                }
            });
            return sContext.trim();
        },

        /**
          *
         */
        _clearAttachments: function () {
            var oModel = this.getView().getModel("chat");
            oModel.setProperty("/attachments", []);
            this._updateCurrentConversationAttachments([]);

            // comment
            this._clearAttachmentDom();
            this._updateAttachmentAreaVisibility();
        },

        onExit: function () {
            this._isExiting = true;
            this._abortActiveStreamRequest();
            this._clearAllManagedTimeouts();

            if (this._fnSidebarResizeHandler) {
                window.removeEventListener("resize", this._fnSidebarResizeHandler);
                this._fnSidebarResizeHandler = null;
            }

            if (this._oSidebarDomRef && this._fnSidebarPointerDown) {
                this._oSidebarDomRef.removeEventListener("pointerdown", this._fnSidebarPointerDown, true);
                this._oSidebarDomRef.removeEventListener("mousedown", this._fnSidebarPointerDown, true);
            }
            this._oSidebarDomRef = null;
            this._fnSidebarPointerDown = null;

            this._clearSidebarColumnWidth();

            if (this._oChatRoute) {
                this._oChatRoute.detachPatternMatched(this._onRouteMatched, this);
                this._oChatRoute = null;
            }

            if (this._oBoundTextAreaElement && this._fnMessageInputKeydown) {
                this._oBoundTextAreaElement.removeEventListener("keydown", this._fnMessageInputKeydown, true);
            }
            this._oBoundTextAreaElement = null;
            this._fnMessageInputKeydown = null;

            if (this._oBoundFileInput && this._fnFileInputChange) {
                this._oBoundFileInput.removeEventListener("change", this._fnFileInputChange);
            }
            this._oBoundFileInput = null;
            this._fnFileInputChange = null;
        }
    });
});





