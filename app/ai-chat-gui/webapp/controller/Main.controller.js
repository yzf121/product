sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/m/MessageBox",
    "sap/m/MessageToast",
    "com/ai/assistant/aichatapp/util/Utils"
], function (Controller, MessageBox, MessageToast, Utils) {
    "use strict";

    var FILE_UPLOAD_CONFIG = {
        MAX_FILE_SIZE: 50 * 1024 * 1024,  // 50 MB
        MAX_FILES_PER_SESSION: 5,
        ALLOWED_EXTENSIONS: ['.pdf', '.docx', '.txt', '.md', '.json', '.xml', '.csv', '.xlsx', '.xls'],
        POLL_INTERVAL: 2000,              // 轮询间隔（2 秒）
        MAX_POLL_ATTEMPTS: 60             // 最大轮询次数（约 2 分钟）
    };

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
            this._isExiting = false;
            this._pendingTimeouts = new Set();
            this._oActiveStreamController = null;
            this._oPendingResubmitPayload = null;
            this._bEditLastUserDialogOpen = false;
            this._fnMessageInputKeydown = null;
            this._oBoundTextAreaElement = null;
            this._fnFileInputChange = null;
            this._oBoundFileInput = null;
            this._oUploadDropZoneDomRef = null;
            this._fnUploadDragEnter = null;
            this._fnUploadDragOver = null;
            this._fnUploadDragLeave = null;
            this._fnUploadDrop = null;
            this._nUploadDragEnterCounter = 0;
            this._bSidebarWidthCustomized = false;
            this._fnSidebarPointerDown = null;
            this._oSidebarDomRef = null;

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


        onAfterRendering: function () {
            this._bindKeyboardShortcut();
            this._bindFileInputChange();
            this._bindDragAndDropUpload();
            this._renderAttachmentsFromModel();
            this._syncWelcomeBoxAfterRender();
            this._bindSidebarResizeIntent();
            this._applySidebarColumnWidth();

            if (!this._fnSidebarResizeHandler) {
                this._fnSidebarResizeHandler = this._applySidebarColumnWidth.bind(this);
                window.addEventListener("resize", this._fnSidebarResizeHandler);
            }
        },

        _bindKeyboardShortcut: function () {
            var oTextArea = this.byId("messageInput");

            if (oTextArea && oTextArea.getDomRef()) {
                var oDomRef = oTextArea.getDomRef();
                var oTextAreaElement = oDomRef.querySelector("textarea");

                if (oTextAreaElement) {
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
                            if (oEvent.key === "Enter" && !oEvent.shiftKey) {
                                oEvent.preventDefault();
                                oEvent.stopPropagation();
                                that.onSendMessage();
                            }
                        };
                    }

                    oTextAreaElement.addEventListener("keydown", this._fnMessageInputKeydown, true);
                    this._oBoundTextAreaElement = oTextAreaElement;
                }
            }
        },

        _onRouteMatched: function (oEvent) {
            var sAiType = oEvent.getParameter("arguments").aiType;
            var oModel = this.getView().getModel("chat");
            var oI18n = this.getView().getModel("i18n").getResourceBundle();
            var sPreviousAiType = oModel.getProperty("/currentAiType");

            if (oModel.getProperty("/isLoading")) {
                this._abortActiveStreamRequest();
                oModel.setProperty("/isLoading", false);
            }

            if (!oModel.getProperty("/attachments")) {
                oModel.setProperty("/attachments", []);
            }

            if (!oModel.getProperty("/conversationSearchQuery")) {
                oModel.setProperty("/conversationSearchQuery", "");
            }

            oModel.setProperty("/currentAiType", sAiType);

            var sTitleKey = this._getAiTitleKey(sAiType);
            var sTitle = oI18n.getText(sTitleKey);
            oModel.setProperty("/currentAiTitle", sTitle);

            this.byId("chatPageTitle").setText(sTitle);

            this._updateWelcomeMessage(sAiType);

            if (sPreviousAiType && sPreviousAiType !== sAiType) {
                this._resetCurrentConversation();
                oModel.setProperty("/conversationSearchQuery", "");
            }

            this._filterConversationsByAiType(sAiType);
        },

        _resetCurrentConversation: function () {
            var oModel = this.getView().getModel("chat");

            oModel.setProperty("/currentConversationId", null);
            oModel.setProperty("/messages", []);
            this._oPendingResubmitPayload = null;
            this._setAttachmentsForConversation(null);

            this._clearMessageContainer();
            this._showWelcomeBox();
        },

        _filterConversationsByAiType: function (sAiType) {
            var oModel = this.getView().getModel("chat");
            var aAllConversations = this.getOwnerComponent()._aAllConversations || [];

            aAllConversations.forEach(function (oConversation) {
                this._normalizeConversation(oConversation);
            }.bind(this));

            var aFilteredConversations = aAllConversations.filter(function (conv) {
                return conv.aiType === sAiType;
            });

            oModel.setProperty("/conversations", this._sortConversations(aFilteredConversations));
            this._applyConversationSearchFilter();
        },

        _normalizeConversation: function (oConversation) {
            if (!oConversation) {
                return;
            }
            if (!Array.isArray(oConversation.messages)) {
                oConversation.messages = [];
            }
            if (!Array.isArray(oConversation.attachments)) {
                oConversation.attachments = [];
            }
            if (typeof oConversation.isPinned !== "boolean") {
                oConversation.isPinned = false;
            }
        },

        _sortConversations: function (aConversations) {
            var that = this;
            return (aConversations || []).slice().sort(function (a, b) {
                var nPinnedDiff = (b && b.isPinned ? 1 : 0) - (a && a.isPinned ? 1 : 0);
                if (nPinnedDiff !== 0) {
                    return nPinnedDiff;
                }

                var nTimeA = that._getConversationSortTimestamp(a);
                var nTimeB = that._getConversationSortTimestamp(b);
                if (nTimeB !== nTimeA) {
                    return nTimeB - nTimeA;
                }

                var sTitleA = (a && a.title ? a.title : "").toLowerCase();
                var sTitleB = (b && b.title ? b.title : "").toLowerCase();
                return sTitleA.localeCompare(sTitleB);
            });
        },

        _getConversationSortTimestamp: function (oConversation) {
            if (!oConversation) {
                return 0;
            }

            if (oConversation.updatedAt) {
                var nUpdatedTime = new Date(oConversation.updatedAt).getTime();
                if (!isNaN(nUpdatedTime)) {
                    return nUpdatedTime;
                }
            }

            if (oConversation.lastUpdate) {
                var sLastUpdate = String(oConversation.lastUpdate).replace(" ", "T");
                var nLastUpdateTime = new Date(sLastUpdate).getTime();
                if (!isNaN(nLastUpdateTime)) {
                    return nLastUpdateTime;
                }
            }

            return 0;
        },

        onConversationSearch: function (oEvent) {
            var sQuery = oEvent.getParameter("newValue");
            if (sQuery === undefined) {
                sQuery = oEvent.getParameter("query");
            }
            var oModel = this.getView().getModel("chat");
            oModel.setProperty("/conversationSearchQuery", sQuery || "");
            this._applyConversationSearchFilter();
        },

        _applyConversationSearchFilter: function () {
            var oModel = this.getView().getModel("chat");
            var aConversations = oModel.getProperty("/conversations") || [];
            var sQuery = oModel.getProperty("/conversationSearchQuery") || "";
            var that = this;

            var aVisibleConversations = aConversations.filter(function (oConversation) {
                return that._matchConversationByQuery(oConversation, sQuery);
            });

            oModel.setProperty("/visibleConversations", aVisibleConversations);

            this._setManagedTimeout(function () {
                that._restoreConversationSelection();
            }, 0);
        },

        _matchConversationByQuery: function (oConversation, sQuery) {
            var sNormalizedQuery = this._normalizeSearchText(sQuery);
            if (!sNormalizedQuery) {
                return true;
            }

            var sTitle = this._normalizeSearchText(oConversation && oConversation.title ? oConversation.title : "");
            if (!sTitle) {
                return false;
            }

            if (sTitle.indexOf(sNormalizedQuery) !== -1) {
                return true;
            }

            var aTokens = sNormalizedQuery.split(" ").filter(function (sToken) {
                return Boolean(sToken);
            });

            if (aTokens.length <= 1) {
                return false;
            }

            return aTokens.every(function (sToken) {
                return sTitle.indexOf(sToken) !== -1;
            });
        },

        _normalizeSearchText: function (sText) {
            return String(sText || "").toLowerCase().replace(/\s+/g, " ").trim();
        },

        _restoreConversationSelection: function () {
            var oList = this.byId("conversationList");
            if (!oList) {
                return;
            }

            var oModel = this.getView().getModel("chat");
            var sCurrentId = oModel.getProperty("/currentConversationId");
            if (!sCurrentId) {
                oList.removeSelections(true);
                return;
            }

            var aItems = oList.getItems() || [];
            var oTargetItem = null;

            for (var i = 0; i < aItems.length; i++) {
                var oContext = aItems[i].getBindingContext("chat");
                var oConversation = oContext ? oContext.getObject() : null;
                if (oConversation && oConversation.id === sCurrentId) {
                    oTargetItem = aItems[i];
                    break;
                }
            }

            if (oTargetItem) {
                oList.setSelectedItem(oTargetItem, true);
            } else {
                oList.removeSelections(true);
            }
        },

        _updateWelcomeMessage: function (sAiType) {
            var oI18n = this.getView().getModel("i18n").getResourceBundle();
            var oWelcomeBox = this.byId("welcomeBox");

            if (!oWelcomeBox) {
                return;
            }

            var sWelcomeTitleKey = "welcomeTitle_" + sAiType;
            var sWelcomeMessageKey = "welcomeMessage_" + sAiType;

            var sWelcomeTitle = oI18n.getText(sWelcomeTitleKey);
            var sWelcomeMessage = oI18n.getText(sWelcomeMessageKey);

            if (sWelcomeTitle === sWelcomeTitleKey) {
                sWelcomeTitle = oI18n.getText("welcomeTitle");
            }
            if (sWelcomeMessage === sWelcomeMessageKey) {
                sWelcomeMessage = oI18n.getText("welcomeMessage");
            }

            var aItems = oWelcomeBox.getItems();
            aItems.forEach(function (oItem) {
                if (oItem.isA("sap.m.Title")) {
                    oItem.setText(sWelcomeTitle);
                } else if (oItem.isA("sap.m.Text")) {
                    oItem.setText(sWelcomeMessage);
                }
            });
        },

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

        onNavBack: function () {
            this._abortActiveStreamRequest();
            var oRouter = this.getOwnerComponent().getRouter();
            oRouter.navTo("home");
        },

        onToggleSidebar: function () {
            var oFlexibleColumnLayout = this.byId("flexibleColumnLayout");
            var sCurrentLayout = oFlexibleColumnLayout.getLayout();

            if (sCurrentLayout === "OneColumn" || sCurrentLayout === "MidColumnFullScreen") {
                oFlexibleColumnLayout.setLayout("TwoColumnsMidExpanded");
            } else {
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

            var nBeginWidth = 22;
            oBeginColumn.style.flex = "0 0 " + nBeginWidth + "%";
            oBeginColumn.style.maxWidth = nBeginWidth + "%";
            oBeginColumn.style.width = nBeginWidth + "%";
            oMidColumn.style.removeProperty("flex");
            oMidColumn.style.removeProperty("max-width");
            oMidColumn.style.removeProperty("width");
        },

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

            var oNewConversation = {
                id: this._generateUUID(),
                title: oI18n.getText("newConversation"),
                messages: [],
                lastUpdate: this._formatDate(new Date()),
                updatedAt: new Date().toISOString(),
                sessionId: null,
                sessionInfo: null,  // 首次收到会话响应后再初始化
                attachments: [],
                isPinned: false,
                aiType: sCurrentAiType  // 保留当前 AI 类型
            };

            var aAllConversations = this.getOwnerComponent()._aAllConversations || [];
            aAllConversations.unshift(oNewConversation);
            this.getOwnerComponent()._aAllConversations = aAllConversations;

            this._filterConversationsByAiType(sCurrentAiType);

            oModel.setProperty("/currentConversationId", oNewConversation.id);
            oModel.setProperty("/messages", []);
            this._oPendingResubmitPayload = null;
            this._setAttachmentsForConversation(oNewConversation);
            this._applyConversationSearchFilter();

            this._clearMessageContainer();
            this._showWelcomeBox();

            this.getOwnerComponent().saveConversationsToStorage();

            if (!bSilent) {
                MessageToast.show(oI18n.getText("newConversationCreated"));
            }
        },


        onConversationSelect: function (oEvent) {
            var oContext;
            var oSource = oEvent.getSource();

            if (oEvent.getParameter("listItem")) {
                oContext = oEvent.getParameter("listItem").getBindingContext("chat");
            } else {
                oContext = oSource.getBindingContext("chat");
            }

            if (oContext) {
                var oConversation = oContext.getObject();
                var oModel = this.getView().getModel("chat");

                var aConversations = oModel.getProperty("/conversations") || [];
                var oFullConversation = aConversations.find(function (conv) {
                    return conv.id === oConversation.id;
                });

                if (oFullConversation) {
                    oModel.setProperty("/currentConversationId", oFullConversation.id);
                    this._oPendingResubmitPayload = null;
                    var aMessages = JSON.parse(JSON.stringify(oFullConversation.messages || []));
                    oModel.setProperty("/messages", aMessages);
                    this._setAttachmentsForConversation(oFullConversation);

                    this._renderMessages();

                    if (aMessages.length > 0) {
                        this._hideWelcomeBox();
                    } else {
                        this._showWelcomeBox();
                    }

                    this._scrollToBottom();
                }
            }
        },

        onEditConversationTitle: function (oEvent) {
            var that = this;
            var oSource = oEvent.getSource();
            var oContext = oSource.getBindingContext("chat");

            if (this._bEditDialogOpen) {
                return;
            }

            if (oContext) {
                var oConversation = oContext.getObject();
                var sPath = oContext.getPath();

                this._bEditDialogOpen = true;

                var oI18n = this.getView().getModel("i18n").getResourceBundle();

                sap.ui.require(["sap/m/Dialog", "sap/m/Input", "sap/m/Button"], function (Dialog, Input, Button) {
                    var oInput = new Input({
                        value: oConversation.title,
                        width: "100%",
                        placeholder: oI18n.getText("editTitle")
                    });

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
                                    that._syncToAllConversations(oModel.getProperty("/conversations") || []);
                                    that._applyConversationSearchFilter();
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

        onToggleConversationPin: function (oEvent) {
            if (oEvent && oEvent.preventDefault) {
                oEvent.preventDefault();
            }
            if (oEvent && oEvent.stopPropagation) {
                oEvent.stopPropagation();
            }

            var oSource = oEvent.getSource();
            var oContext = oSource.getBindingContext("chat");
            if (!oContext) {
                return;
            }

            var oConversation = oContext.getObject();
            var oModel = this.getView().getModel("chat");
            var aConversations = oModel.getProperty("/conversations") || [];
            var iConversationIndex = aConversations.findIndex(function (oItem) {
                return oItem.id === oConversation.id;
            });

            if (iConversationIndex < 0) {
                return;
            }

            aConversations[iConversationIndex].isPinned = !aConversations[iConversationIndex].isPinned;
            oModel.setProperty("/conversations", this._sortConversations(aConversations));

            this._syncToAllConversations(oModel.getProperty("/conversations") || []);
            this._applyConversationSearchFilter();
            this.getOwnerComponent().saveConversationsToStorage();

            var oI18n = this.getView().getModel("i18n").getResourceBundle();
            MessageToast.show(
                aConversations[iConversationIndex].isPinned
                    ? oI18n.getText("conversationPinned")
                    : oI18n.getText("conversationUnpinned")
            );
        },

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
                            var sCurrentId = oModel.getProperty("/currentConversationId");
                            var sCurrentAiType = oModel.getProperty("/currentAiType");

                            var aAllConversations = that.getOwnerComponent()._aAllConversations || [];
                            aAllConversations = aAllConversations.filter(function (conv) {
                                return conv.id !== oConversation.id;
                            });
                            that.getOwnerComponent()._aAllConversations = aAllConversations;
                            that._filterConversationsByAiType(sCurrentAiType);

                            if (sCurrentId === oConversation.id) {
                                oModel.setProperty("/currentConversationId", null);
                                oModel.setProperty("/messages", []);
                                that._oPendingResubmitPayload = null;
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

        onSendMessage: function () {
            var oModel = this.getView().getModel("chat");
            var oTextArea = this.byId("messageInput");

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
                MessageToast.show("消息过长，请精简后重试");
                return;
            }

            oModel.setProperty("/inputValue", sTrimmedMessage);

            this._ensureCurrentConversation(true);
            var oSendAttachmentPayload = this._extractReadyAttachmentsForSend();
            if (this._oPendingResubmitPayload) {
                oSendAttachmentPayload = this._mergeAttachmentPayloads(oSendAttachmentPayload, this._oPendingResubmitPayload);
                this._oPendingResubmitPayload = null;
            }

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

            oModel.setProperty("/inputValue", "");
            if (oTextArea) {
                oTextArea.setValue("");
            }

            this._hideWelcomeBox();

            this._clearRenderedLastUserEditAction();
            this._renderUserMessage(oUserMessage, true);

            this._persistCurrentConversationState();

            oModel.setProperty("/isLoading", true);

            var oAIMessage = {
                id: this._generateUUID(),
                role: "assistant",
                content: "",
                timestamp: new Date().toISOString()
            };
            aMessages.push(oAIMessage);
            oModel.setProperty("/messages", aMessages);

            this._renderAIMessageContainer(oAIMessage.id);

            this._scrollToBottom();

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
            aConversations[iConvIndex].updatedAt = new Date().toISOString();
            aConversations = this._sortConversations(aConversations);
            oModel.setProperty("/conversations", aConversations);
            this._syncToAllConversations(aConversations);
            this._applyConversationSearchFilter();
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


        _SESSION_CONFIG: {
            MAX_ROUNDS: 50,        // 上游会话轮次上限
            EXPIRE_HOURS: 1,       // 上游会话过期时长（小时）
            FALLBACK_ROUNDS: 10    // 降级到 messages 模式时保留的轮次
        },

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

            var sSessionId = oCurrentConv ? oCurrentConv.sessionId : null;
            var oSessionInfo = oCurrentConv ? oCurrentConv.sessionInfo : null;

            var aCurrentMessages = oModel.getProperty("/messages") || [];
            var sAiType = oModel.getProperty("/currentAiType");

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
                                that._syncToAllConversations(aConversations);
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
                        console.error("流读取错误:", streamError);
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
                console.error("AI调用错误:", error);
                if (!that._isExiting) {
                    MessageToast.show((error && error.message) ? error.message : oI18n.getText("aiServiceUnavailable"));
                }
                finalizeRequest();

                if (that._isExiting) {
                    return;
                }
                removeAssistantPlaceholder();
            });
        },

        _renderUserMessage: function (oMessage, bCanEditLastUserMessage) {
            var that = this;
            var oMessageList = this.byId("messageList");
            var oDomRef = oMessageList.getDomRef();

            if (!oDomRef) {
                this._setManagedTimeout(function () {
                    that._renderUserMessage(oMessage, bCanEditLastUserMessage);
                }, 100);
                return;
            }

            var sAttachmentStripHtml = this._buildMessageAttachmentStripHtml(oMessage.attachments);
            var sEditActionHtml = "";
            if (bCanEditLastUserMessage) {
                var oI18n = this.getView().getModel("i18n").getResourceBundle();
                var sTooltip = Utils.escapeHtml(oI18n.getText("editAndResubmitTooltip"));
                var sButtonText = Utils.escapeHtml(oI18n.getText("editAndResubmit"));
                sEditActionHtml = '<div class="messageActionArea userMessageActionArea" id="user-actions-' + oMessage.id + '">' +
                    '<button class="editLastUserMessageBtn" id="edit-user-msg-' + oMessage.id + '" title="' + sTooltip + '">' +
                    '<span class="sapUiIcon" style="font-family: SAP-icons">&#xe038;</span>' +
                    '<span>' + sButtonText + '</span>' +
                    '</button>' +
                    '</div>';
            }
            var sHtml = '<div class="messageItem userMessage" id="user-msg-' + oMessage.id + '">' +
                '<div class="avatarContainer">' +
                '<img class="avatarImage userAvatarImg" src="images/user_avatar_1772638105594.png" alt="User Avatar">' +
                '</div>' +
                '<div class="messageContent">' +
                '<div class="messageText">' + Utils.escapeHtml(oMessage.content) + '</div>' +
                sAttachmentStripHtml +
                sEditActionHtml +
                '</div>' +
                '</div>';

            oDomRef.insertAdjacentHTML("beforeend", sHtml);

            if (bCanEditLastUserMessage) {
                var oEditButton = document.getElementById("edit-user-msg-" + oMessage.id);
                if (oEditButton) {
                    oEditButton.addEventListener("click", function () {
                        that._onEditLastUserMessage(oMessage.id);
                    });
                }
            }
        },

        _clearRenderedLastUserEditAction: function () {
            var aActionContainers = document.querySelectorAll(".userMessageActionArea");
            for (var i = 0; i < aActionContainers.length; i++) {
                aActionContainers[i].remove();
            }
        },

        _getLastUserMessageInfo: function (aMessages) {
            var aSafeMessages = Array.isArray(aMessages) ? aMessages : [];
            for (var i = aSafeMessages.length - 1; i >= 0; i--) {
                if (aSafeMessages[i].role === "user") {
                    return {
                        index: i,
                        message: aSafeMessages[i]
                    };
                }
            }
            return null;
        },

        _onEditLastUserMessage: function (sMessageId) {
            var oModel = this.getView().getModel("chat");
            var oI18n = this.getView().getModel("i18n").getResourceBundle();

            if (oModel.getProperty("/isLoading")) {
                MessageToast.show(oI18n.getText("cannotEditDuringGeneration"));
                return;
            }

            var aMessages = oModel.getProperty("/messages") || [];
            var oLastUserInfo = this._getLastUserMessageInfo(aMessages);
            if (!oLastUserInfo || !oLastUserInfo.message || oLastUserInfo.message.id !== sMessageId) {
                MessageToast.show(oI18n.getText("onlyLatestUserMessageEditable"));
                return;
            }

            this._openEditLastUserMessageDialog(oLastUserInfo);
        },

        _openEditLastUserMessageDialog: function (oLastUserInfo) {
            if (this._bEditLastUserDialogOpen) {
                return;
            }

            this._bEditLastUserDialogOpen = true;
            var that = this;
            var oI18n = this.getView().getModel("i18n").getResourceBundle();

            sap.ui.require(["sap/m/Dialog", "sap/m/TextArea", "sap/m/Button"], function (Dialog, TextArea, Button) {
                var oInput = new TextArea({
                    value: oLastUserInfo.message.content || "",
                    width: "100%",
                    rows: 6,
                    growing: true,
                    growingMaxLines: 10
                });

                var oDialog = new Dialog({
                    title: oI18n.getText("editLastUserMessageTitle"),
                    type: "Message",
                    contentWidth: "36rem",
                    content: [oInput],
                    beginButton: new Button({
                        text: oI18n.getText("resubmit"),
                        type: "Emphasized",
                        press: function () {
                            var sEditedMessage = (oInput.getValue() || "").trim();
                            if (!sEditedMessage) {
                                MessageToast.show(oI18n.getText("messageCannotBeEmpty"));
                                return;
                            }

                            that._resubmitEditedLastUserMessage(oLastUserInfo.message.id, sEditedMessage);
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
                        that._bEditLastUserDialogOpen = false;
                    }
                });

                oDialog.open();
            });
        },

        _resubmitEditedLastUserMessage: function (sOriginalMessageId, sEditedMessage) {
            var oModel = this.getView().getModel("chat");
            var aMessages = oModel.getProperty("/messages") || [];
            var oLastUserInfo = this._getLastUserMessageInfo(aMessages);
            var oI18n = this.getView().getModel("i18n").getResourceBundle();

            if (!oLastUserInfo || !oLastUserInfo.message || oLastUserInfo.message.id !== sOriginalMessageId) {
                MessageToast.show(oI18n.getText("onlyLatestUserMessageEditable"));
                return;
            }

            var oOriginalUserMessage = oLastUserInfo.message;
            this._oPendingResubmitPayload = {
                attachments: JSON.parse(JSON.stringify(oOriginalUserMessage.attachments || [])),
                contextText: oOriginalUserMessage.attachmentContext || ""
            };

            var aRetainedMessages = aMessages.slice(0, oLastUserInfo.index);
            oModel.setProperty("/messages", aRetainedMessages);
            oModel.setProperty("/inputValue", sEditedMessage);

            var oTextArea = this.byId("messageInput");
            if (oTextArea) {
                oTextArea.setValue(sEditedMessage);
            }

            this._renderMessages();
            if (aRetainedMessages.length > 0) {
                this._hideWelcomeBox();
            } else {
                this._showWelcomeBox();
            }

            this._persistCurrentConversationState();

            this._setManagedTimeout(function () {
                this.onSendMessage();
            }.bind(this), 0);
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
                    sMeta = sSize + " · " + sExt;
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

        _renderAIMessageContainer: function (sMessageId) {
            var that = this;
            var oMessageList = this.byId("messageList");
            var oDomRef = oMessageList.getDomRef();

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

            // 为助手消息增加整段复制按钮区域
            var oActionArea = document.getElementById("ai-actions-" + sMessageId);
            if (oActionArea) {
                var oI18n = this.getView().getModel("i18n").getResourceBundle();
                var sCopyText = oI18n.getText("copy");
                var sCopiedText = oI18n.getText("copied");
                var sCopyFailedText = oI18n.getText("copyFailed");

                var oCopyMsgBtn = document.createElement("button");
                oCopyMsgBtn.className = "copyMessageBtn";
                oCopyMsgBtn.title = sCopyText;
                // SAP 图标编码：&#xe0ec;（复制）
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
                var sRenderedContent = this._renderMarkdown(sContent);
                oTextElement.innerHTML = sRenderedContent;

                if (bFinalize !== false) {
                    this._highlightCode(oTextElement);

                    this._addCopyButtons(oTextElement);
                }
            }
        },


        _finalizeAIMessage: function (sMessageId, sContent) {
            var oModel = this.getView().getModel("chat");
            var aMessages = oModel.getProperty("/messages") || [];
            var sCurrentId = oModel.getProperty("/currentConversationId");

            var oMessage = aMessages.find(function (msg) {
                return msg.id === sMessageId;
            });

            if (oMessage) {
                oMessage.content = sContent;
            }

            var aConversations = oModel.getProperty("/conversations") || [];
            var iConvIndex = aConversations.findIndex(function (conv) {
                return conv.id === sCurrentId;
            });

            if (iConvIndex >= 0) {
                aConversations[iConvIndex].messages = JSON.parse(JSON.stringify(aMessages));
                aConversations[iConvIndex].lastUpdate = this._formatDate(new Date());
                aConversations[iConvIndex].updatedAt = new Date().toISOString();

                if (aConversations[iConvIndex].sessionId) {
                    if (!aConversations[iConvIndex].sessionInfo) {
                        aConversations[iConvIndex].sessionInfo = {
                            createdAt: new Date().toISOString(),
                            roundCount: 1
                        };
                    } else {
                        aConversations[iConvIndex].sessionInfo.roundCount++;
                    }
                    console.log("[AI] 当前轮次: " + aConversations[iConvIndex].sessionInfo.roundCount);
                }

                delete aConversations[iConvIndex]._sessionIdSaved;

                var oI18n = this.getView().getModel("i18n").getResourceBundle();
                var sNewConvTitle = oI18n.getText("newConversation");
                if (aMessages.length <= 2 && aConversations[iConvIndex].title === sNewConvTitle) {
                    var sFirstUserMsg = aMessages[0] ? aMessages[0].content : "";
                    aConversations[iConvIndex].title = sFirstUserMsg.substring(0, 20) + (sFirstUserMsg.length > 20 ? "..." : "");
                }
            }

            aConversations = this._sortConversations(aConversations);
            oModel.setProperty("/conversations", aConversations);
            oModel.setProperty("/messages", aMessages);

            this._syncToAllConversations(aConversations);
            this._applyConversationSearchFilter();

            this.getOwnerComponent().saveConversationsToStorage();
        },

        _syncToAllConversations: function (aFilteredConversations) {
            var aAllConversations = this.getOwnerComponent()._aAllConversations || [];

            aFilteredConversations.forEach(function (oConv) {
                var iIndex = aAllConversations.findIndex(function (c) {
                    return c.id === oConv.id;
                });
                if (iIndex >= 0) {
                    aAllConversations[iIndex] = oConv;
                } else {
                    aAllConversations.push(oConv);
                }
            });

            this.getOwnerComponent()._aAllConversations = aAllConversations;
        },

        _renderMarkdown: function (sContent) {
            if (typeof marked !== "undefined") {
                marked.setOptions({
                    breaks: true,
                    gfm: true
                });
                var sSafeContent = Utils.escapeHtml(sContent);
                return marked.parse(sSafeContent);
            }
            return Utils.escapeHtml(sContent);
        },

        _highlightCode: function (oElement) {
            if (typeof hljs !== "undefined") {
                var aCodeBlocks = oElement.querySelectorAll("pre code");
                aCodeBlocks.forEach(function (block) {
                    hljs.highlightElement(block);
                });
            }
        },


        _addCopyButtons: function (oElement) {
            var that = this;
            var aPreBlocks = oElement.querySelectorAll("pre");
            var oI18n = this.getView().getModel("i18n").getResourceBundle();
            var sCopyText = oI18n.getText("copy");
            var sCopiedText = oI18n.getText("copied");
            var sCopyFailedText = oI18n.getText("copyFailed");

            aPreBlocks.forEach(function (pre) {
                if (pre.parentNode && pre.parentNode.classList && pre.parentNode.classList.contains("codeBlockWrapper")) {
                    return;
                }

                var oCopyBtn = document.createElement("button");
                oCopyBtn.className = "copyButton";
                oCopyBtn.innerHTML = '<span class="sapUiIcon" style="font-family: SAP-icons">&#xe0ec;</span> ' + sCopyText;
                oCopyBtn.onclick = function () {
                    var sCode = pre.querySelector("code") ? pre.querySelector("code").textContent : pre.textContent;
                    Utils.copyTextToClipboard(sCode).then(function () {
                        oCopyBtn.innerHTML = '<span class="sapUiIcon" style="font-family: SAP-icons">&#xe05b;</span> ' + sCopiedText;
                        that._setManagedTimeout(function () {
                            oCopyBtn.innerHTML = '<span class="sapUiIcon" style="font-family: SAP-icons">&#xe0ec;</span> ' + sCopyText;
                        }, 2000);
                    }).catch(function () {
                        MessageToast.show(sCopyFailedText);
                    });
                };

                var oWrapper = document.createElement("div");
                oWrapper.className = "codeBlockWrapper";
                pre.parentNode.insertBefore(oWrapper, pre);
                oWrapper.appendChild(pre);
                oWrapper.appendChild(oCopyBtn);
            });
        },

        _renderMessages: function () {
            var that = this;
            var oModel = this.getView().getModel("chat");
            var aMessages = oModel.getProperty("/messages") || [];
            var oLastUserInfo = this._getLastUserMessageInfo(aMessages);
            var sLastUserMessageId = oLastUserInfo && oLastUserInfo.message ? oLastUserInfo.message.id : null;

            this._clearMessageContainer();

            aMessages.forEach(function (oMessage) {
                if (oMessage.role === "user") {
                    that._renderUserMessage(oMessage, oMessage.id === sLastUserMessageId);
                } else if (oMessage.role === "assistant") {
                    that._renderAIMessageContainer(oMessage.id);
                    if (oMessage.content) {
                        that._updateAIMessageContent(oMessage.id, oMessage.content);
                    }
                }
            });
        },

        _clearMessageContainer: function () {
            var oMessageList = this.byId("messageList");
            var oDomRef = oMessageList.getDomRef();

            if (oDomRef) {
                oDomRef.innerHTML = "";
            }
        },

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

        _buildRequestBody: function (sMessage, sSessionId, oSessionInfo, aMessages, sAiType, sAttachmentContext) {
            var bUseSessionId = this._shouldUseSessionId(sSessionId, oSessionInfo);

            var sContextText = sAttachmentContext || this._getReadySessionParsedTexts();
            var sFinalMessage = this._buildPromptWithContext(sMessage, sContextText);

            if (sContextText) {
                console.log("[AI] 附加了前端解析上下文，原始长度: " + sContextText.length + "，最终Prompt长度: " + sFinalMessage.length);
            }

            if (bUseSessionId) {
                console.log("[AI] 使用 session_id 模式");
                return {
                    message: sFinalMessage,
                    sessionId: sSessionId,
                    sessionInfo: oSessionInfo,
                    aiType: sAiType
                };
            } else if (aMessages && aMessages.length > 2) {
                console.log("[AI] 使用 messages 模式（降级）");
                var aHistoryMessages = this._buildMessagesArray(aMessages);
                return {
                    message: sFinalMessage,
                    messages: aHistoryMessages,
                    sessionInfo: oSessionInfo,
                    aiType: sAiType
                };
            } else {
                console.log("[AI] 新对话模式");
                return {
                    message: sFinalMessage,
                    aiType: sAiType
                };
            }
        },

        _buildPromptWithContext: function (sMessage, sContextText) {
            var sSafeMessage = typeof sMessage === "string" ? sMessage : "";
            var sSafeContext = typeof sContextText === "string" ? sContextText : "";
            var nPromptLimit = CHAT_REQUEST_LIMITS.MAX_PROMPT_LENGTH;

            if (!sSafeContext) {
                return sSafeMessage.slice(0, nPromptLimit);
            }

            var sPrefix = "基于以下参考资料：\n\n";
            var sMiddle = "\n\n--- 资料结束 ---\n\n用户问题：\n";
            var nAvailableContext = nPromptLimit - sPrefix.length - sMiddle.length - sSafeMessage.length;

            if (nAvailableContext <= 0) {
                return sSafeMessage.slice(0, nPromptLimit);
            }

            var sTrimmedContext = sSafeContext.length > nAvailableContext ? sSafeContext.slice(0, nAvailableContext) : sSafeContext;
            return sPrefix + sTrimmedContext + sMiddle + sSafeMessage;
        },

        _extractBackendErrorMessage: function (sRawError, sFallback) {
            var sDefaultText = sFallback || "请求失败，请稍后重试";
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
                // 忽略解析错误，回退为纯文本
            }

            return sRawText;
        },

        _shouldUseSessionId: function (sSessionId, oSessionInfo) {
            if (!sSessionId) {
                return false;
            }

            if (!oSessionInfo) {
                return true;
            }

            if (oSessionInfo.roundCount >= this._SESSION_CONFIG.MAX_ROUNDS) {
                console.log("[AI] session_id 已达轮次上限，切换到 messages 模式");
                return false;
            }

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

        _buildMessagesArray: function (aMessages) {
            var aHistory = aMessages.slice(0, -2);
            var that = this;

            var nMaxRounds = this._SESSION_CONFIG.FALLBACK_ROUNDS;
            var nMaxMessages = nMaxRounds * 2;  // 一轮 = 一条用户消息 + 一条助手消息
            if (aHistory.length > nMaxMessages) {
                aHistory = aHistory.slice(-nMaxMessages);
            }

            return aHistory.filter(function (msg) {
                return msg.content;  // 过滤空内容
            }).map(function (msg) {
                var sContent = msg.content;
                if (msg.role === "user" && msg.attachmentContext) {
                    sContent = that._buildPromptWithContext(sContent, msg.attachmentContext);
                }
                if (msg.role === "assistant" && sContent.length > 1000) {
                    sContent = sContent.substring(0, 1000) + "...";
                }
                return {
                    role: msg.role,
                    content: sContent
                };
            });
        },

        _generateUUID: function () {
            return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
                var r = Math.random() * 16 | 0;
                var v = c === "x" ? r : (r & 0x3 | 0x8);
                return v.toString(16);
            });
        },

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

        _hideWelcomeBox: function () {
            var oWelcomeBox = this.byId("welcomeBox");
            if (oWelcomeBox) {
                oWelcomeBox.setVisible(false);
            }
        },

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


        _bindFileInputChange: function () {
            var that = this;

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
         * 点击上传按钮并触发原生文件选择框
         */
        _bindDragAndDropUpload: function () {
            var that = this;

            this._setManagedTimeout(function () {
                var oDropZone = that.byId("inputAreaGlass");
                var oDomRef = oDropZone && oDropZone.getDomRef ? oDropZone.getDomRef() : null;
                if (!oDomRef) {
                    return;
                }

                if (that._oUploadDropZoneDomRef && that._oUploadDropZoneDomRef !== oDomRef) {
                    that._unbindDragAndDropUpload();
                }

                if (!that._fnUploadDragEnter) {
                    that._fnUploadDragEnter = function (oEvent) {
                        if (!that._hasFilesInDataTransfer(oEvent.dataTransfer)) {
                            return;
                        }
                        oEvent.preventDefault();
                        oEvent.stopPropagation();
                        that._nUploadDragEnterCounter++;
                        that._setUploadDragOverState(true);
                    };
                }

                if (!that._fnUploadDragOver) {
                    that._fnUploadDragOver = function (oEvent) {
                        if (!that._hasFilesInDataTransfer(oEvent.dataTransfer)) {
                            return;
                        }
                        oEvent.preventDefault();
                        oEvent.stopPropagation();
                        if (oEvent.dataTransfer) {
                            oEvent.dataTransfer.dropEffect = "copy";
                        }
                        that._setUploadDragOverState(true);
                    };
                }

                if (!that._fnUploadDragLeave) {
                    that._fnUploadDragLeave = function (oEvent) {
                        if (!that._hasFilesInDataTransfer(oEvent.dataTransfer)) {
                            return;
                        }
                        oEvent.preventDefault();
                        oEvent.stopPropagation();

                        that._nUploadDragEnterCounter = Math.max(0, that._nUploadDragEnterCounter - 1);
                        if (that._nUploadDragEnterCounter === 0) {
                            that._setUploadDragOverState(false);
                        }
                    };
                }

                if (!that._fnUploadDrop) {
                    that._fnUploadDrop = function (oEvent) {
                        if (!that._hasFilesInDataTransfer(oEvent.dataTransfer)) {
                            return;
                        }
                        oEvent.preventDefault();
                        oEvent.stopPropagation();

                        that._nUploadDragEnterCounter = 0;
                        that._setUploadDragOverState(false);
                        that._handleSelectedFiles(oEvent.dataTransfer ? oEvent.dataTransfer.files : null);
                    };
                }

                if (that._oUploadDropZoneDomRef !== oDomRef) {
                    oDomRef.addEventListener("dragenter", that._fnUploadDragEnter);
                    oDomRef.addEventListener("dragover", that._fnUploadDragOver);
                    oDomRef.addEventListener("dragleave", that._fnUploadDragLeave);
                    oDomRef.addEventListener("drop", that._fnUploadDrop);
                    that._oUploadDropZoneDomRef = oDomRef;
                }
            }, 300);
        },

        _unbindDragAndDropUpload: function () {
            if (!this._oUploadDropZoneDomRef) {
                return;
            }

            if (this._fnUploadDragEnter) {
                this._oUploadDropZoneDomRef.removeEventListener("dragenter", this._fnUploadDragEnter);
            }
            if (this._fnUploadDragOver) {
                this._oUploadDropZoneDomRef.removeEventListener("dragover", this._fnUploadDragOver);
            }
            if (this._fnUploadDragLeave) {
                this._oUploadDropZoneDomRef.removeEventListener("dragleave", this._fnUploadDragLeave);
            }
            if (this._fnUploadDrop) {
                this._oUploadDropZoneDomRef.removeEventListener("drop", this._fnUploadDrop);
            }

            this._setUploadDragOverState(false);
            this._oUploadDropZoneDomRef = null;
            this._nUploadDragEnterCounter = 0;
        },

        _hasFilesInDataTransfer: function (oDataTransfer) {
            if (!oDataTransfer || !oDataTransfer.types) {
                return false;
            }

            if (typeof oDataTransfer.types.contains === "function") {
                return oDataTransfer.types.contains("Files");
            }

            return Array.prototype.indexOf.call(oDataTransfer.types, "Files") !== -1;
        },

        _setUploadDragOverState: function (bActive) {
            if (!this._oUploadDropZoneDomRef) {
                return;
            }

            if (bActive) {
                this._oUploadDropZoneDomRef.classList.add("dragOver");
            } else {
                this._oUploadDropZoneDomRef.classList.remove("dragOver");
            }
        },

        onUploadFile: function () {
            var oModel = this.getView().getModel("chat");
            var aAttachments = oModel.getProperty("/attachments") || [];
            var oI18n = this.getView().getModel("i18n").getResourceBundle();

            if (aAttachments.length >= FILE_UPLOAD_CONFIG.MAX_FILES_PER_SESSION) {
                MessageToast.show(oI18n.getText("maxFilesReached") || "最多只允许上传 " + FILE_UPLOAD_CONFIG.MAX_FILES_PER_SESSION + " 个文件");
                return;
            }

            var oFileInput = document.getElementById("hiddenFileInput");
            if (oFileInput) {
                oFileInput.value = "";  // 清空输入框值，确保重复选择同一文件也会触发变更事件
                oFileInput.click();
            }
        },

        _handleFileSelect: function (oEvent) {
            var oTarget = oEvent && oEvent.target ? oEvent.target : null;
            var aFiles = oTarget && oTarget.files ? oTarget.files : null;
            this._handleSelectedFiles(aFiles);

            if (oTarget) {
                oTarget.value = "";
            }
        },

        _handleSelectedFiles: function (aFileList) {
            var aSelectedFiles = Array.prototype.slice.call(aFileList || []);
            if (aSelectedFiles.length === 0) {
                return;
            }

            var oModel = this.getView().getModel("chat");
            var oI18n = this.getView().getModel("i18n").getResourceBundle();
            var aExistingAttachments = oModel.getProperty("/attachments") || [];
            var nRemainingSlots = FILE_UPLOAD_CONFIG.MAX_FILES_PER_SESSION - aExistingAttachments.length;

            if (nRemainingSlots <= 0) {
                MessageToast.show(oI18n.getText("maxFilesReached") || ("Only " + FILE_UPLOAD_CONFIG.MAX_FILES_PER_SESSION + " files are allowed"));
                return;
            }

            this._ensureCurrentConversation(true);

            if (aSelectedFiles.length > nRemainingSlots) {
                MessageToast.show(
                    oI18n.getText("filesLimitedNotice", [nRemainingSlots]) ||
                    ("Only the first " + nRemainingSlots + " files are accepted")
                );
                aSelectedFiles = aSelectedFiles.slice(0, nRemainingSlots);
            }

            var aAttachments = aExistingAttachments.slice();
            var aNewAttachments = [];
            var aValidationErrors = [];

            aSelectedFiles.forEach(function (oFile) {
                var sValidationError = this._validateFileForUpload(oFile, oI18n);
                if (sValidationError) {
                    aValidationErrors.push((oFile && oFile.name ? oFile.name : "unknown") + ": " + sValidationError);
                    return;
                }

                var oAttachment = this._buildAttachmentFromFile(oFile, oI18n);
                aAttachments.push(oAttachment);
                aNewAttachments.push(oAttachment);
            }.bind(this));

            if (aValidationErrors.length > 0) {
                MessageBox.error(aValidationErrors.join("\n"));
            }

            if (aNewAttachments.length === 0) {
                return;
            }

            oModel.setProperty("/attachments", aAttachments);
            this._updateCurrentConversationAttachments(aAttachments);
            aNewAttachments.forEach(function (oAttachment) {
                this._renderAttachmentCard(oAttachment);
                this._uploadFile(oAttachment);
            }.bind(this));
            this._updateAttachmentAreaVisibility();
        },

        _buildAttachmentFromFile: function (oFile, oI18n) {
            var sFileName = oFile.name || "";
            var nLastDot = sFileName.lastIndexOf(".");
            var sExt = nLastDot >= 0 ? sFileName.substring(nLastDot + 1).toLowerCase() : "";

            return {
                id: this._generateUUID(),
                file: oFile,
                fileName: oFile.name,
                fileSize: oFile.size,
                fileExt: sExt,
                status: "uploading",
                progress: 0,
                fileId: null,
                message: oI18n.getText("uploading") || "Uploading..."
            };
        },

        _validateFileForUpload: function (oFile, oI18n) {
            if (!oFile) {
                return oI18n.getText("fileUploadError") || "Invalid file";
            }

            if (oFile.size > FILE_UPLOAD_CONFIG.MAX_FILE_SIZE) {
                return (oI18n.getText("fileTooLarge") || "File too large") +
                    " (max " + this._formatFileSize(FILE_UPLOAD_CONFIG.MAX_FILE_SIZE) + ")";
            }

            var sFileName = oFile.name || "";
            var nLastDot = sFileName.lastIndexOf(".");
            var sExt = nLastDot >= 0 ? sFileName.substring(nLastDot).toLowerCase() : "";
            if (!sExt || FILE_UPLOAD_CONFIG.ALLOWED_EXTENSIONS.indexOf(sExt) === -1) {
                return (oI18n.getText("unsupportedFileType") || "Unsupported file type") + ": " + (sExt || sFileName || "unknown");
            }

            return "";
        },

        _loadScript: function (sUrl, sGlobalVar) {
            return new Promise(function (resolve, reject) {
                if (window[sGlobalVar]) {
                    resolve(window[sGlobalVar]);
                    return;
                }
                var script = document.createElement('script');
                script.src = sUrl;
                script.onload = function () { resolve(window[sGlobalVar]); };
                script.onerror = function () { reject(new Error("加载脚本失败: " + sUrl)); };
                document.head.appendChild(script);
            });
        },

        /**
         * 上传流程在前端本地解析，不走后端解析
         */
        _uploadFile: function (oAttachment) {
            var that = this;
            var oI18n = this.getView().getModel("i18n").getResourceBundle();

            that._updateAttachmentCard(oAttachment.id, {
                status: 'processing',
                progress: 50,
                message: oI18n.getText("parsing") || "解析中..."
            });
            that._updateAttachmentInModel(oAttachment.id, {
                status: 'processing'
            });

            this._parseFileLocally(oAttachment.file, oAttachment.fileExt)
                .then(function (sParsedText) {
                    that._updateAttachmentCard(oAttachment.id, {
                        status: 'ready',
                        progress: 100,
                        message: oI18n.getText("ready") || "已就绪"
                    });
                    that._updateAttachmentInModel(oAttachment.id, {
                        status: 'ready',
                        parsedText: sParsedText
                    });
                    MessageToast.show(oAttachment.fileName + " " + (oI18n.getText("parseComplete") || "解析完成"));
                })
                .catch(function (error) {
                    console.error("[FileParse] 前端解析错误:", error);
                    that._updateAttachmentCard(oAttachment.id, {
                        status: 'error',
                        progress: 0,
                        message: error.message || "解析失败"
                    });
                    that._updateAttachmentInModel(oAttachment.id, {
                        status: 'error',
                        message: error.message
                    });
                    MessageToast.show(error.message || "文件解析失败");
                });
        },

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
                    reject(new Error("不支持在浏览器中直接解析此类型的文件: " + sExt));
                }
            });
        },

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
                '<button class="fileDeleteBtn" id="file-delete-' + oAttachment.id + '" title="删除">' +
                '<span class="sapUiIcon deleteIcon" style="font-family: SAP-icons">&#xe03e;</span>' +
                '</button>' +
                '</div>';

            oDomRef.insertAdjacentHTML("beforeend", sHtml);

            var oDeleteBtn = document.getElementById("file-delete-" + oAttachment.id);
            if (oDeleteBtn) {
                oDeleteBtn.addEventListener("click", function () {
                    that._removeAttachment(oAttachment.id);
                });
            }
        },

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

        _removeAttachment: function (sAttachmentId) {
            var oModel = this.getView().getModel("chat");
            var aAttachments = oModel.getProperty("/attachments") || [];

            aAttachments = aAttachments.filter(function (a) {
                return a.id !== sAttachmentId;
            });
            oModel.setProperty("/attachments", aAttachments);
            this._updateCurrentConversationAttachments(aAttachments);

            var oCardEl = document.getElementById("file-card-" + sAttachmentId);
            if (oCardEl) {
                oCardEl.remove();
            }

            this._updateAttachmentAreaVisibility();
        },

        _updateAttachmentAreaVisibility: function () {
            var oModel = this.getView().getModel("chat");
            var aAttachments = oModel.getProperty("/attachments") || [];
            var oAttachmentArea = this.byId("attachmentPreviewArea");

            if (oAttachmentArea) {
                oAttachmentArea.setVisible(aAttachments.length > 0);
            }
        },

        _getFileTypeIcon: function (sExt) {
            var sLowerExt = (sExt || '').toLowerCase();
            return FILE_TYPE_ICONS[sLowerExt] || FILE_TYPE_ICONS['default'];
        },

        _formatFileSize: function (nBytes) {
            if (nBytes < 1024) {
                return nBytes + " B";
            } else if (nBytes < 1024 * 1024) {
                return (nBytes / 1024).toFixed(1) + " KB";
            } else {
                return (nBytes / (1024 * 1024)).toFixed(1) + " MB";
            }
        },

        _mergeAttachmentPayloads: function (oPrimaryPayload, oSecondaryPayload) {
            var oMergedPayload = {
                attachments: [],
                contextText: ""
            };

            var aPrimaryAttachments = Array.isArray(oPrimaryPayload && oPrimaryPayload.attachments) ? oPrimaryPayload.attachments : [];
            var aSecondaryAttachments = Array.isArray(oSecondaryPayload && oSecondaryPayload.attachments) ? oSecondaryPayload.attachments : [];
            oMergedPayload.attachments = aPrimaryAttachments.concat(aSecondaryAttachments);

            var sPrimaryContext = oPrimaryPayload && oPrimaryPayload.contextText ? String(oPrimaryPayload.contextText).trim() : "";
            var sSecondaryContext = oSecondaryPayload && oSecondaryPayload.contextText ? String(oSecondaryPayload.contextText).trim() : "";
            oMergedPayload.contextText = [sPrimaryContext, sSecondaryContext].filter(function (sBlock) {
                return Boolean(sBlock);
            }).join("\n\n");

            return oMergedPayload;
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
                        aContextBlocks.push("【文件：" + oAttachment.fileName + "】\n" + oAttachment.parsedText);
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

        _getReadySessionParsedTexts: function () {
            var oModel = this.getView().getModel("chat");
            var aAttachments = oModel.getProperty("/attachments") || [];
            var sContext = "";

            aAttachments.forEach(function (a) {
                if (a.status === 'ready' && a.parsedText) {
                    sContext += "【文件：" + a.fileName + "】\n" + a.parsedText + "\n\n";
                }
            });
            return sContext.trim();
        },

        _clearAttachments: function () {
            var oModel = this.getView().getModel("chat");
            oModel.setProperty("/attachments", []);
            this._updateCurrentConversationAttachments([]);

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

            this._unbindDragAndDropUpload();
            this._fnUploadDragEnter = null;
            this._fnUploadDragOver = null;
            this._fnUploadDragLeave = null;
            this._fnUploadDrop = null;
            this._oPendingResubmitPayload = null;
            this._bEditLastUserDialogOpen = false;
        }
    });
});






