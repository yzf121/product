sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/m/MessageToast",
    "sap/m/MessageBox"
], function (Controller, MessageToast, MessageBox) {
    "use strict";

    return Controller.extend("com.ai.assistant.aichatapp.controller.Home", {

        onInit: function () {
            // 首页控制器初始化
            // 绑定FSD转TSD自定义磁贴的点击事件
            this.getView().addEventDelegate({
                onAfterRendering: this._bindFsd2TsdTiles.bind(this)
            });
        },

        /**
         * 绑定FSD转TSD自定义HTML磁贴的点击事件
         */
        _bindFsd2TsdTiles: function () {
            if (this._bFsd2TsdBound) {
                return;
            }

            var that = this;
            var oTileI = document.getElementById("fsd2tsdTileI");
            var oTileE = document.getElementById("fsd2tsdTileE");

            if (oTileI) {
                oTileI.addEventListener("click", function () {
                    that._navigateToFsd2Tsd("fsd2tsd-i", "FSD转TSD助手（I）");
                });
                oTileI.addEventListener("keydown", function (e) {
                    if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        that._navigateToFsd2Tsd("fsd2tsd-i", "FSD转TSD助手（I）");
                    }
                });
            }

            if (oTileE) {
                oTileE.addEventListener("click", function () {
                    that._navigateToFsd2Tsd("fsd2tsd-e", "FSD转TSD助手（E）");
                });
                oTileE.addEventListener("keydown", function (e) {
                    if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        that._navigateToFsd2Tsd("fsd2tsd-e", "FSD转TSD助手（E）");
                    }
                });
            }

            if (oTileI || oTileE) {
                this._bFsd2TsdBound = true;
            }
        },

        /**
         * 导航到FSD转TSD聊天页面
         */
        _navigateToFsd2Tsd: function (sAiType, sHeader) {
            var oRouter = this.getOwnerComponent().getRouter();
            oRouter.navTo("chat", {
                aiType: sAiType
            });

            var oI18n = this.getView().getModel("i18n").getResourceBundle();
            MessageToast.show(oI18n.getText("enteringChat", [sHeader]));
        },

        /**
         * 点击卡片时触发，跳转到对应的聊天页面
         * @param {sap.ui.base.Event} oEvent 点击事件
         */
        onTilePress: function (oEvent) {
            var oTile = oEvent.getSource();
            var sAiType = oTile.data("aiType");
            var sHeader = oTile.getHeader();

            // 获取路由并导航到聊天页面
            var oRouter = this.getOwnerComponent().getRouter();
            oRouter.navTo("chat", {
                aiType: sAiType
            });

            // 显示提示
            var oI18n = this.getView().getModel("i18n").getResourceBundle();
            MessageToast.show(oI18n.getText("enteringChat", [sHeader]));
        },

        /**
         * 点击 Diagram Helper 卡片，跳转到流程图页面
         */
        onDiagramTilePress: function () {
            var oRouter = this.getOwnerComponent().getRouter();
            oRouter.navTo("diagram");

            var oI18n = this.getView().getModel("i18n").getResourceBundle();
            MessageToast.show(oI18n.getText("enteringDiagram"));
        },

        /**
         * 设置按钮点击事件
         */
        onSettingsPress: function () {
            var oI18n = this.getView().getModel("i18n").getResourceBundle();
            MessageBox.information(oI18n.getText("aboutMessage"), {
                title: oI18n.getText("aboutTitle")
            });
        }
    });
});
