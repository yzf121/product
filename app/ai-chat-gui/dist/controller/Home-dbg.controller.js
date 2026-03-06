sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "sap/ui/core/Fragment",
    "sap/ui/model/json/JSONModel",
    "com/ai/assistant/aichatapp/service/AIConfig"
], function (Controller, MessageToast, MessageBox, Fragment, JSONModel, AIConfig) {
    "use strict";

    return Controller.extend("com.ai.assistant.aichatapp.controller.Home", {

        onInit: function () {
            this._bConfigPromptShown = false;
            this._oSettingsModel = new JSONModel(this._buildSettingsModelData());
            this.getView().setModel(this._oSettingsModel, "settings");

            this._oAfterRenderingDelegate = {
                onAfterRendering: this._onAfterRendering.bind(this)
            };
            this.getView().addEventDelegate(this._oAfterRenderingDelegate);
        },

        _onAfterRendering: function () {
            this._bindFsd2TsdTiles();
            this._refreshSettingsModel();
            this._maybePromptForMissingConfig();
        },

        _getI18n: function () {
            return this.getView().getModel("i18n").getResourceBundle();
        },

        _buildSettingsModelData: function () {
            var oStatus = AIConfig.getStatus();
            var oConfig = AIConfig.getEditableConfig();
            var oI18n = this.getView() && this.getView().getModel("i18n") ? this._getI18n() : null;
            var aSources = [];

            if (oStatus.hasFileConfig) {
                aSources.push("config/ai-config.js");
            }

            if (oStatus.hasUserOverride) {
                aSources.push(oI18n ? oI18n.getText("settingsSourceBrowser") : "Browser local settings");
            }

            return {
                statusVisible: true,
                statusType: oStatus.isReady ? "Success" : "Warning",
                statusText: oStatus.isReady
                    ? (oI18n ? oI18n.getText("configStatusReady", [aSources.join(" + ") || "config/ai-config.js"]) : "AI configuration is ready")
                    : (oI18n ? oI18n.getText("configStatusMissing") : "AI configuration is missing"),
                sourceText: aSources.join(" + ") || (oI18n ? oI18n.getText("settingsSourceNone") : "Not configured"),
                hasUserOverride: oStatus.hasUserOverride,
                endpoint: oConfig.endpoint,
                devProxyPath: oConfig.devProxyPath,
                timeoutMs: oConfig.timeoutMs,
                defaultAppId: oConfig.defaultAppId,
                defaultApiKey: oConfig.defaultApiKey,
                appIdsJson: AIConfig.toPrettyJson(oConfig.appIds),
                apiKeysJson: AIConfig.toPrettyJson(oConfig.apiKeys)
            };
        },

        _refreshSettingsModel: function () {
            if (!this._oSettingsModel) {
                return;
            }
            this._oSettingsModel.setData(this._buildSettingsModelData());
        },

        _maybePromptForMissingConfig: function () {
            if (this._bConfigPromptShown || AIConfig.hasAnyUsableConfig()) {
                return;
            }

            this._bConfigPromptShown = true;
            MessageToast.show(this._getI18n().getText("configStatusMissing"));
            this._openSettingsDialog();
        },

        _openSettingsDialog: function () {
            var that = this;

            this._refreshSettingsModel();

            if (this._oSettingsDialog) {
                this._oSettingsDialog.open();
                return;
            }

            Fragment.load({
                id: this.getView().getId(),
                name: "com.ai.assistant.aichatapp.view.SettingsDialog",
                controller: this
            }).then(function (oDialog) {
                that._oSettingsDialog = oDialog;
                that.getView().addDependent(oDialog);
                oDialog.open();
            }).catch(function (error) {
                console.error("[Settings] Failed to load dialog:", error);
                MessageBox.error("Settings dialog failed to load");
            });
        },

        _parseJsonObject: function (sValue, sLabel) {
            var sText = String(sValue || "").trim();
            if (!sText) {
                return {};
            }

            try {
                var oParsed = JSON.parse(sText);
                if (!oParsed || typeof oParsed !== "object" || Array.isArray(oParsed)) {
                    throw new Error(sLabel + " must be a JSON object");
                }
                return oParsed;
            } catch (error) {
                throw new Error(sLabel + ": " + error.message);
            }
        },

        _bindFsd2TsdTiles: function () {
            var that = this;
            var oTileI = document.getElementById("fsd2tsdTileI");
            var oTileE = document.getElementById("fsd2tsdTileE");

            if (!this._fnTileIClick) {
                this._fnTileIClick = function () {
                    that._navigateToFsd2Tsd("fsd2tsd-i", "FSDè½¬TSDåŠ©æ‰‹ï¼ˆIï¼‰");
                };
                this._fnTileIKeydown = function (e) {
                    if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        that._navigateToFsd2Tsd("fsd2tsd-i", "FSDè½¬TSDåŠ©æ‰‹ï¼ˆIï¼‰");
                    }
                };
            }

            if (!this._fnTileEClick) {
                this._fnTileEClick = function () {
                    that._navigateToFsd2Tsd("fsd2tsd-e", "FSDè½¬TSDåŠ©æ‰‹ï¼ˆEï¼‰");
                };
                this._fnTileEKeydown = function (e) {
                    if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        that._navigateToFsd2Tsd("fsd2tsd-e", "FSDè½¬TSDåŠ©æ‰‹ï¼ˆEï¼‰");
                    }
                };
            }

            if (this._oBoundTileI && this._oBoundTileI !== oTileI) {
                this._oBoundTileI.removeEventListener("click", this._fnTileIClick);
                this._oBoundTileI.removeEventListener("keydown", this._fnTileIKeydown);
                this._oBoundTileI = null;
            }
            if (this._oBoundTileE && this._oBoundTileE !== oTileE) {
                this._oBoundTileE.removeEventListener("click", this._fnTileEClick);
                this._oBoundTileE.removeEventListener("keydown", this._fnTileEKeydown);
                this._oBoundTileE = null;
            }

            if (oTileI && this._oBoundTileI !== oTileI) {
                oTileI.addEventListener("click", this._fnTileIClick);
                oTileI.addEventListener("keydown", this._fnTileIKeydown);
                this._oBoundTileI = oTileI;
            }

            if (oTileE && this._oBoundTileE !== oTileE) {
                oTileE.addEventListener("click", this._fnTileEClick);
                oTileE.addEventListener("keydown", this._fnTileEKeydown);
                this._oBoundTileE = oTileE;
            }

            if (oTileI || oTileE) {
                this._bFsd2TsdBound = true;
            }
        },

        _navigateToFsd2Tsd: function (sAiType, sHeader) {
            var oRouter = this.getOwnerComponent().getRouter();
            oRouter.navTo("chat", {
                aiType: sAiType
            });

            MessageToast.show(this._getI18n().getText("enteringChat", [sHeader]));
        },

        onTilePress: function (oEvent) {
            var oTile = oEvent.getSource();
            var sAiType = oTile.data("aiType");
            var sHeader = oTile.getHeader();

            this.getOwnerComponent().getRouter().navTo("chat", {
                aiType: sAiType
            });

            MessageToast.show(this._getI18n().getText("enteringChat", [sHeader]));
        },

        onDiagramTilePress: function () {
            this.getOwnerComponent().getRouter().navTo("diagram");
            MessageToast.show(this._getI18n().getText("enteringDiagram"));
        },

        onSettingsPress: function () {
            this._openSettingsDialog();
        },

        onSaveSettings: function () {
            var oI18n = this._getI18n();

            try {
                AIConfig.saveUserConfig({
                    endpoint: this._oSettingsModel.getProperty("/endpoint"),
                    devProxyPath: this._oSettingsModel.getProperty("/devProxyPath"),
                    timeoutMs: this._oSettingsModel.getProperty("/timeoutMs"),
                    defaultAppId: this._oSettingsModel.getProperty("/defaultAppId"),
                    defaultApiKey: this._oSettingsModel.getProperty("/defaultApiKey"),
                    appIds: this._parseJsonObject(this._oSettingsModel.getProperty("/appIdsJson"), oI18n.getText("settingsAssistantAppIds")),
                    apiKeys: this._parseJsonObject(this._oSettingsModel.getProperty("/apiKeysJson"), oI18n.getText("settingsAssistantApiKeys"))
                });

                this._refreshSettingsModel();
                MessageToast.show(oI18n.getText("settingsSaved"));
            } catch (error) {
                MessageBox.error(error.message || oI18n.getText("settingsJsonInvalid"));
            }
        },

        onResetSettingsOverrides: function () {
            AIConfig.clearUserConfig();
            this._refreshSettingsModel();
            MessageToast.show(this._getI18n().getText("settingsReset"));
        },

        onCloseSettingsDialog: function () {
            if (this._oSettingsDialog) {
                this._oSettingsDialog.close();
            }
        },

        onExit: function () {
            if (this._oAfterRenderingDelegate) {
                this.getView().removeEventDelegate(this._oAfterRenderingDelegate);
                this._oAfterRenderingDelegate = null;
            }

            if (this._oBoundTileI) {
                this._oBoundTileI.removeEventListener("click", this._fnTileIClick);
                this._oBoundTileI.removeEventListener("keydown", this._fnTileIKeydown);
                this._oBoundTileI = null;
            }
            if (this._oBoundTileE) {
                this._oBoundTileE.removeEventListener("click", this._fnTileEClick);
                this._oBoundTileE.removeEventListener("keydown", this._fnTileEKeydown);
                this._oBoundTileE = null;
            }

            if (this._oSettingsDialog) {
                this._oSettingsDialog.destroy();
                this._oSettingsDialog = null;
            }
        }
    });
});
