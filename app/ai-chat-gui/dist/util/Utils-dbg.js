sap.ui.define([], function () {
    "use strict";

    /**
     * 公共工具模块
     * 提供跨控制器共享的通用工具函数
     */
    var Utils = {

        /**
         * 复制文本到剪贴板（兼容新旧 API）
         * @param {string} sText 要复制的文本
         * @returns {Promise} 复制结果
         */
        copyTextToClipboard: function (sText) {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                return navigator.clipboard.writeText(sText);
            }
            return new Promise(function (resolve, reject) {
                var oTextarea = document.createElement("textarea");
                oTextarea.value = sText;
                oTextarea.setAttribute("readonly", "");
                oTextarea.style.position = "absolute";
                oTextarea.style.left = "-9999px";
                document.body.appendChild(oTextarea);
                oTextarea.select();
                try {
                    var bSuccess = document.execCommand("copy");
                    if (bSuccess) {
                        resolve();
                    } else {
                        reject(new Error("copy failed"));
                    }
                } catch (e) {
                    reject(e);
                } finally {
                    document.body.removeChild(oTextarea);
                }
            });
        },

        /**
         * HTML 实体转义（防止 XSS）
         * @param {string} sText 原始文本
         * @returns {string} 转义后的文本
         */
        escapeHtml: function (sText) {
            if (!sText) {
                return "";
            }
            var oDiv = document.createElement("div");
            oDiv.textContent = sText;
            return oDiv.innerHTML;
        },

        /**
         * 解析 SSE（Server-Sent Events）响应流
         * @param {Response} oResponse fetch 响应对象
         * @param {object} oCallbacks 回调函数集合
         * @param {function} oCallbacks.onData 收到数据时调用 (oData)
         * @param {function} oCallbacks.onDone 流结束时调用 ()
         * @param {function} oCallbacks.onError 错误时调用 (error)
         * @returns {Promise}
         */
        parseSSEStream: function (oResponse, oCallbacks) {
            if (!oResponse.body) {
                return Promise.reject(new Error("响应体不支持流式读取"));
            }

            var reader = oResponse.body.getReader();
            var decoder = new TextDecoder();
            var sBuffer = "";

            function processEventBlock(sEventBlock) {
                if (!sEventBlock) {
                    return false;
                }

                var aDataLines = sEventBlock.split("\n").filter(function (sLine) {
                    return sLine.indexOf("data:") === 0;
                }).map(function (sLine) {
                    return sLine.slice(5).trim();
                });

                if (!aDataLines.length) {
                    return false;
                }

                var sPayload = aDataLines.join("\n").trim();
                if (!sPayload) {
                    return false;
                }

                if (sPayload === "[DONE]") {
                    return true;
                }

                try {
                    var oData = JSON.parse(sPayload);
                    if (oCallbacks.onData) {
                        oCallbacks.onData(oData);
                    }
                } catch {
                    // 忽略不完整帧的解析错误，继续读取后续数据
                }

                return false;
            }

            function flushBuffer(bForceFlushTail) {
                var bReceivedDoneMarker = false;
                var sNormalized = sBuffer.replace(/\r\n/g, "\n");
                var nBoundaryIndex = sNormalized.indexOf("\n\n");

                while (nBoundaryIndex !== -1) {
                    var sEventBlock = sNormalized.slice(0, nBoundaryIndex);
                    sNormalized = sNormalized.slice(nBoundaryIndex + 2);
                    if (processEventBlock(sEventBlock)) {
                        bReceivedDoneMarker = true;
                    }
                    nBoundaryIndex = sNormalized.indexOf("\n\n");
                }

                if (bForceFlushTail && sNormalized.trim()) {
                    if (processEventBlock(sNormalized)) {
                        bReceivedDoneMarker = true;
                    }
                    sNormalized = "";
                }

                sBuffer = sNormalized;
                return bReceivedDoneMarker;
            }

            function readStream() {
                return reader.read().then(function (oResult) {
                    if (oResult.done) {
                        sBuffer += decoder.decode();
                        flushBuffer(true);
                        if (oCallbacks.onDone) {
                            oCallbacks.onDone();
                        }
                        return;
                    }

                    sBuffer += decoder.decode(oResult.value, { stream: true });
                    flushBuffer(false);
                    return readStream();
                }).catch(function (error) {
                    if (oCallbacks.onError) {
                        oCallbacks.onError(error);
                    }
                    return Promise.reject(error);
                });
            }

            return readStream();
        }
    };

    return Utils;
});
