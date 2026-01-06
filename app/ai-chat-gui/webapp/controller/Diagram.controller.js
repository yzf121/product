sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/m/MessageBox",
    "sap/m/MessageToast",
    "sap/ui/model/json/JSONModel",
    "sap/ui/core/HTML"
], function (Controller, MessageBox, MessageToast, JSONModel, HTML) {
    "use strict";

    return Controller.extend("com.ai.assistant.aichatapp.controller.Diagram", {
        
        // 架构图应用ID（从环境变量配置）
        _DIAGRAM_AI_TYPE: "diagram",
        
        // 缩放相关常量
        _ZOOM_STEP: 0.15,
        _MIN_ZOOM: 0.2,
        _MAX_ZOOM: 3,
        
        // Mermaid 渲染计数器（确保唯一ID）
        _renderCount: 0,
        
        /**
         * 控制器初始化
         */
        onInit: function () {
            // 初始化 Diagram 数据模型
            var oDiagramModel = new JSONModel({
                inputValue: "",
                mermaidCode: "",
                isLoading: false,
                hasMermaid: false,
                showFixButton: false,
                errorMessage: "",
                viewMode: "preview",
                zoomLevel: 1,
                lastAiResponse: "",
                sessionId: null
            });
            this.getView().setModel(oDiagramModel, "diagram");
            
            // 初始化 Mermaid 库
            this._initMermaid();
        },
        
        /**
         * 视图渲染完成后
         */
        onAfterRendering: function () {
            // 初始化预览区域
            this._initPreviewArea();
        },
        
        /**
         * 初始化 Mermaid 库
         */
        _initMermaid: function () {
            var that = this;
            
            if (typeof mermaid !== "undefined") {
                this._configureMermaid();
                return;
            }
            
            // 动态加载 Mermaid
            var script = document.createElement("script");
            script.src = sap.ui.require.toUrl("com/ai/assistant/aichatapp/lib/mermaid.min.js");
            script.onload = function () {
                that._configureMermaid();
                console.log("[Diagram] Mermaid 库加载完成");
            };
            script.onerror = function () {
                console.error("[Diagram] Mermaid 库加载失败");
                MessageToast.show(that._getI18nText("mermaidLoadFailed"));
            };
            document.head.appendChild(script);
        },
        
        /**
         * 配置 Mermaid
         */
        _configureMermaid: function () {
            if (typeof mermaid !== "undefined") {
                mermaid.initialize({
                    startOnLoad: false,
                    theme: "default",
                    securityLevel: "loose",
                    fontFamily: "Microsoft YaHei, SimHei, Arial, sans-serif",
                    flowchart: {
                        useMaxWidth: false,
                        htmlLabels: true,
                        curve: "basis",
                        padding: 20
                    },
                    sequence: {
                        useMaxWidth: false
                    },
                    gantt: {
                        useMaxWidth: false
                    }
                });
            }
        },
        
        /**
         * 初始化预览区域
         */
        _initPreviewArea: function () {
            var oPreviewContainer = this.byId("previewContainer");
            if (!oPreviewContainer) return;
            
            var oDomRef = oPreviewContainer.getDomRef();
            if (!oDomRef) {
                // DOM 未准备好，延迟重试
                var that = this;
                setTimeout(function() {
                    that._initPreviewArea();
                }, 100);
                return;
            }
            
            // 创建预览区域 HTML 结构
            this._createPreviewHTML(oDomRef);
            
            // 初始化拖拽和缩放
            this._initInteractions();
        },
        
        /**
         * 创建预览区域 HTML
         */
        _createPreviewHTML: function (oContainer) {
            // 清空容器
            oContainer.innerHTML = "";
            
            // 创建预览区域
            var oPreviewArea = document.createElement("div");
            oPreviewArea.id = this.getView().getId() + "--previewArea";
            oPreviewArea.className = "mermaidPreviewArea";
            
            // 创建内容容器
            var oContentWrapper = document.createElement("div");
            oContentWrapper.className = "mermaidContentWrapper";
            oContentWrapper.id = this.getView().getId() + "--mermaidContent";
            
            // 占位符
            oContentWrapper.innerHTML = 
                '<div class="diagramPlaceholder">' +
                '<span class="sapUiIcon" style="font-family:SAP-icons;font-size:4rem;color:#bbb;">&#xe145;</span>' +
                '<p>输入描述并点击生成按钮来创建流程图</p>' +
                '</div>';
            
            oPreviewArea.appendChild(oContentWrapper);
            oContainer.appendChild(oPreviewArea);
            
            // 保存引用
            this._oPreviewArea = oPreviewArea;
            this._oContentWrapper = oContentWrapper;
        },
        
        /**
         * 初始化交互功能（拖拽、缩放）
         */
        _initInteractions: function () {
            var that = this;
            var oPreviewArea = this._oPreviewArea;
            if (!oPreviewArea) return;
            
            var isDragging = false;
            var startX, startY, scrollLeft, scrollTop;
            
            // 鼠标按下
            oPreviewArea.addEventListener("mousedown", function (e) {
                // 只在 SVG 区域启用拖拽
                if (e.target.closest("svg") || e.target.closest(".mermaidContentWrapper")) {
                    isDragging = true;
                    oPreviewArea.style.cursor = "grabbing";
                    startX = e.pageX - oPreviewArea.offsetLeft;
                    startY = e.pageY - oPreviewArea.offsetTop;
                    scrollLeft = oPreviewArea.scrollLeft;
                    scrollTop = oPreviewArea.scrollTop;
                    e.preventDefault();
                }
            });
            
            // 鼠标移动
            oPreviewArea.addEventListener("mousemove", function (e) {
                if (!isDragging) return;
                e.preventDefault();
                var x = e.pageX - oPreviewArea.offsetLeft;
                var y = e.pageY - oPreviewArea.offsetTop;
                var walkX = (x - startX) * 1.5;
                var walkY = (y - startY) * 1.5;
                oPreviewArea.scrollLeft = scrollLeft - walkX;
                oPreviewArea.scrollTop = scrollTop - walkY;
            });
            
            // 鼠标释放
            document.addEventListener("mouseup", function () {
                if (isDragging) {
                    isDragging = false;
                    if (oPreviewArea) {
                        oPreviewArea.style.cursor = "grab";
                    }
                }
            });
            
            // 滚轮缩放（Ctrl + 滚轮）
            oPreviewArea.addEventListener("wheel", function (e) {
                if (e.ctrlKey) {
                    e.preventDefault();
                    if (e.deltaY < 0) {
                        that.onZoomIn();
                    } else {
                        that.onZoomOut();
                    }
                }
            }, { passive: false });
        },
        
        /**
         * 返回首页
         */
        onNavBack: function () {
            var oRouter = this.getOwnerComponent().getRouter();
            oRouter.navTo("home");
        },
        
        /**
         * 生成流程图
         */
        onGenerateDiagram: function () {
            var oModel = this.getView().getModel("diagram");
            var sInput = oModel.getProperty("/inputValue");
            
            if (!sInput || !sInput.trim()) {
                MessageToast.show(this._getI18nText("pleaseEnterDescription"));
                return;
            }
            
            // 构建提示词，要求严格输出 Mermaid 格式
            var sPrompt = sInput.trim() + "\n\n" +
                "【重要要求】请严格按照以下格式输出：\n" +
                "1. 必须使用 ```mermaid 开头和 ``` 结尾包裹代码\n" +
                "2. 使用 flowchart TD 或 graph TD 语法\n" +
                "3. 节点ID使用英文字母，显示文本用中文\n" +
                "4. 示例格式：\n" +
                "```mermaid\n" +
                "flowchart TD\n" +
                "    A[开始] --> B[处理]\n" +
                "    B --> C[结束]\n" +
                "```";
            
            this._callDiagramAI(sPrompt, false);
        },
        
        /**
         * 重新生成流程图
         */
        onRegenerateDiagram: function () {
            this.onGenerateDiagram();
        },

        /**
         * 调用架构图 AI 生成 Mermaid
         * @param {string} sPrompt 用户输入的描述
         * @param {boolean} bIsFixRequest 是否为修复请求
         */
        _callDiagramAI: function (sPrompt, bIsFixRequest) {
            var that = this;
            var oModel = this.getView().getModel("diagram");
            
            // 设置加载状态
            oModel.setProperty("/isLoading", true);
            oModel.setProperty("/showFixButton", false);
            oModel.setProperty("/errorMessage", "");
            
            // 构建请求体
            var sSessionId = oModel.getProperty("/sessionId");
            var oRequestBody = {
                message: sPrompt,
                aiType: this._DIAGRAM_AI_TYPE
            };
            
            if (sSessionId) {
                oRequestBody.sessionId = sSessionId;
            }
            
            // 调用流式 API
            fetch("/api/chat/stream", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(oRequestBody)
            }).then(function (response) {
                if (!response.ok) {
                    throw new Error(that._getI18nText("networkError"));
                }
                
                if (!response.body) {
                    throw new Error(that._getI18nText("streamNotSupported"));
                }
                
                var reader = response.body.getReader();
                var decoder = new TextDecoder();
                var sFullContent = "";
                
                function readStream() {
                    return reader.read().then(function (result) {
                        if (result.done) {
                            // 流结束，处理完整响应
                            that._processAIResponse(sFullContent, bIsFixRequest);
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
                                        sFullContent += oData.text;
                                    }
                                    
                                    if (oData.sessionId) {
                                        oModel.setProperty("/sessionId", oData.sessionId);
                                    }
                                } catch (e) {
                                    // 忽略解析错误
                                }
                            }
                        });
                        
                        return readStream();
                    });
                }
                
                return readStream();
            }).catch(function (error) {
                console.error("[Diagram] AI 调用错误:", error);
                MessageToast.show(that._getI18nText("aiServiceUnavailable"));
                oModel.setProperty("/isLoading", false);
            });
        },
        
        /**
         * 处理 AI 响应，提取 Mermaid 代码
         * @param {string} sResponse AI 完整响应
         * @param {boolean} bIsFixRequest 是否为修复请求
         */
        _processAIResponse: function (sResponse, bIsFixRequest) {
            var oModel = this.getView().getModel("diagram");
            
            // 保存原始响应
            oModel.setProperty("/lastAiResponse", sResponse);
            
            // 尝试提取 Mermaid 代码块
            var sMermaidCode = this._extractMermaidCode(sResponse);
            
            if (sMermaidCode) {
                // 清理和修复 Mermaid 代码
                sMermaidCode = this._cleanMermaidCode(sMermaidCode);
                
                oModel.setProperty("/mermaidCode", sMermaidCode);
                oModel.setProperty("/hasMermaid", true);
                oModel.setProperty("/showFixButton", false);
                
                // 自动渲染
                this._renderMermaid(sMermaidCode);
                
                MessageToast.show(this._getI18nText("diagramGenerated"));
            } else {
                // 未提取到 Mermaid，显示修复按钮
                oModel.setProperty("/hasMermaid", false);
                oModel.setProperty("/showFixButton", true);
                oModel.setProperty("/errorMessage", this._getI18nText("outputFormatError"));
                
                if (bIsFixRequest) {
                    MessageToast.show(this._getI18nText("fixFailed"));
                }
            }
        },
        
        /**
         * 从 AI 响应中提取 Mermaid 代码
         * @param {string} sResponse AI 响应文本
         * @returns {string|null} Mermaid 代码或 null
         */
        _extractMermaidCode: function (sResponse) {
            if (!sResponse) return null;
            
            // 匹配 ```mermaid ... ``` 代码块
            var rMermaidBlock = /```mermaid\s*([\s\S]*?)```/i;
            var aMatch = sResponse.match(rMermaidBlock);
            
            if (aMatch && aMatch[1]) {
                return aMatch[1].trim();
            }
            
            // 尝试匹配没有 mermaid 标记的代码块
            var rCodeBlock = /```\s*(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|erDiagram|journey|gantt|pie|gitGraph|subgraph)([\s\S]*?)```/i;
            aMatch = sResponse.match(rCodeBlock);
            
            if (aMatch) {
                return (aMatch[1] + aMatch[2]).trim();
            }
            
            // 尝试直接匹配 Mermaid 语法
            var rDirectMermaid = /^(graph|flowchart)\s+(TB|TD|BT|RL|LR)[\s\S]+/im;
            aMatch = sResponse.match(rDirectMermaid);
            
            if (aMatch) {
                return aMatch[0].trim();
            }
            
            return null;
        },
        
        /**
         * 清理和修复 Mermaid 代码
         * @param {string} sCode 原始代码
         * @returns {string} 清理后的代码
         */
        _cleanMermaidCode: function (sCode) {
            if (!sCode) return sCode;
            
            var sClean = sCode;
            
            // 移除可能的 BOM 和特殊字符
            sClean = sClean.replace(/^\uFEFF/, "");
            
            // 统一换行符
            sClean = sClean.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
            
            // 移除多余的空行
            sClean = sClean.replace(/\n{3,}/g, "\n\n");
            
            // 修复常见的语法问题
            // 1. 确保 flowchart/graph 后有方向
            if (/^flowchart\s*$/im.test(sClean)) {
                sClean = sClean.replace(/^flowchart\s*$/im, "flowchart TD");
            }
            if (/^graph\s*$/im.test(sClean)) {
                sClean = sClean.replace(/^graph\s*$/im, "graph TD");
            }
            
            // 2. 修复中文标点
            sClean = sClean.replace(/：/g, ":").replace(/；/g, ";");
            
            // 3. 修复箭头格式
            sClean = sClean.replace(/--\s*>/g, "-->").replace(/-\s+->/g, "-->");
            
            // 4. 移除行尾多余空格
            sClean = sClean.split("\n").map(function(line) {
                return line.trimEnd();
            }).join("\n");
            
            // 5. 确保以换行结尾
            if (!sClean.endsWith("\n")) {
                sClean += "\n";
            }
            
            return sClean.trim();
        },
        
        /**
         * 一键修复输出格式
         */
        onFixOutputFormat: function () {
            var oModel = this.getView().getModel("diagram");
            var sLastResponse = oModel.getProperty("/lastAiResponse");
            var sOriginalInput = oModel.getProperty("/inputValue");
            
            var sFixPrompt = 
                "你之前的回复格式不正确，我无法提取 Mermaid 代码。请重新生成。\n\n" +
                "【严格要求】\n" +
                "1. 必须使用 ```mermaid 开头\n" +
                "2. 必须使用 ``` 结尾\n" +
                "3. 使用 flowchart TD 语法\n" +
                "4. 节点ID用英文，显示文本用中文放在方括号内\n\n" +
                "原始需求：" + sOriginalInput + "\n\n" +
                "正确格式示例：\n" +
                "```mermaid\n" +
                "flowchart TD\n" +
                "    A[开始] --> B[处理]\n" +
                "    B --> C{判断}\n" +
                "    C -->|是| D[结束]\n" +
                "    C -->|否| B\n" +
                "```\n\n" +
                "请按此格式重新生成流程图。";
            
            this._callDiagramAI(sFixPrompt, true);
        },
        
        /**
         * Mermaid 代码变更
         */
        onMermaidCodeChange: function () {
            var oModel = this.getView().getModel("diagram");
            var sMermaidCode = oModel.getProperty("/mermaidCode");
            oModel.setProperty("/hasMermaid", sMermaidCode && sMermaidCode.trim() !== "");
        },
        
        /**
         * 手动渲染 Mermaid
         */
        onRenderMermaid: function () {
            var oModel = this.getView().getModel("diagram");
            var sMermaidCode = oModel.getProperty("/mermaidCode");
            
            if (!sMermaidCode || !sMermaidCode.trim()) {
                MessageToast.show(this._getI18nText("noMermaidCode"));
                return;
            }
            
            // 清理代码后渲染
            var sCleanCode = this._cleanMermaidCode(sMermaidCode);
            oModel.setProperty("/mermaidCode", sCleanCode);
            
            this._renderMermaid(sCleanCode);
        },

        /**
         * 渲染 Mermaid 图表
         * @param {string} sMermaidCode Mermaid 代码
         */
        _renderMermaid: function (sMermaidCode) {
            var that = this;
            var oModel = this.getView().getModel("diagram");
            
            // 确保预览区域存在
            if (!this._oContentWrapper) {
                this._initPreviewArea();
                setTimeout(function() {
                    that._renderMermaid(sMermaidCode);
                }, 200);
                return;
            }
            
            // 检查 Mermaid 库
            if (typeof mermaid === "undefined") {
                MessageToast.show(this._getI18nText("mermaidNotLoaded"));
                return;
            }
            
            // 隐藏错误提示
            oModel.setProperty("/showFixButton", false);
            
            // 生成唯一 ID
            this._renderCount++;
            var sId = "mermaid-diagram-" + this._renderCount + "-" + Date.now();
            
            // 清空内容区域
            this._oContentWrapper.innerHTML = "";
            
            // 创建渲染容器
            var oRenderDiv = document.createElement("div");
            oRenderDiv.className = "mermaidRenderContainer";
            oRenderDiv.id = sId + "-container";
            this._oContentWrapper.appendChild(oRenderDiv);
            
            try {
                // 使用 Mermaid 渲染
                mermaid.render(sId, sMermaidCode).then(function (result) {
                    // 成功渲染
                    oRenderDiv.innerHTML = result.svg;
                    
                    // 获取 SVG 并优化
                    var oSvg = oRenderDiv.querySelector("svg");
                    if (oSvg) {
                        // 移除固定宽高，使用 viewBox
                        oSvg.style.maxWidth = "none";
                        oSvg.style.height = "auto";
                        oSvg.style.minWidth = "400px";
                        oSvg.style.display = "block";
                        
                        // 保存 SVG 引用
                        that._oRenderedSvg = oSvg;
                        
                        // 重置原始尺寸记录（下次缩放时重新计算）
                        that._nOriginalWidth = null;
                        that._nOriginalHeight = null;
                    }
                    
                    // 重置缩放级别
                    oModel.setProperty("/zoomLevel", 1);
                    
                    // 设置光标
                    if (that._oPreviewArea) {
                        that._oPreviewArea.style.cursor = "grab";
                    }
                    
                    MessageToast.show(that._getI18nText("renderSuccess"));
                    
                }).catch(function (error) {
                    console.error("[Diagram] Mermaid 渲染错误:", error);
                    that._showRenderError(error.message || error.str || "Mermaid 语法错误");
                });
                
            } catch (error) {
                console.error("[Diagram] Mermaid 渲染异常:", error);
                this._showRenderError(error.message || "渲染异常");
            }
        },
        
        /**
         * 显示渲染错误
         * @param {string} sError 错误信息
         */
        _showRenderError: function (sError) {
            var oModel = this.getView().getModel("diagram");
            
            if (this._oContentWrapper) {
                this._oContentWrapper.innerHTML = 
                    '<div class="renderErrorContainer">' +
                    '  <div class="renderErrorIcon">⚠️</div>' +
                    '  <div class="renderErrorTitle">' + this._getI18nText("renderFailed") + '</div>' +
                    '  <div class="renderErrorMessage">' + this._escapeHtml(sError) + '</div>' +
                    '  <div class="renderErrorHint">请检查 Mermaid 语法，或点击左侧"修复输出格式"按钮</div>' +
                    '</div>';
            }
            
            oModel.setProperty("/showFixButton", true);
            oModel.setProperty("/errorMessage", sError);
        },
        
        /**
         * 复制 Mermaid 代码
         */
        onCopyMermaid: function () {
            var that = this;
            var oModel = this.getView().getModel("diagram");
            var sMermaidCode = oModel.getProperty("/mermaidCode");
            
            if (!sMermaidCode) {
                MessageToast.show(this._getI18nText("noMermaidCode"));
                return;
            }
            
            navigator.clipboard.writeText(sMermaidCode).then(function () {
                MessageToast.show(that._getI18nText("mermaidCopied"));
            }).catch(function () {
                MessageToast.show(that._getI18nText("copyFailed"));
            });
        },
        
        /**
         * 视图模式切换
         */
        onViewModeChange: function (oEvent) {
            var sKey = oEvent.getParameter("item").getKey();
            var oModel = this.getView().getModel("diagram");
            oModel.setProperty("/viewMode", sKey);
            
            if (!this._oContentWrapper) return;
            
            var sMermaidCode = oModel.getProperty("/mermaidCode");
            
            if (sKey === "code") {
                // 显示代码视图
                this._oContentWrapper.innerHTML = 
                    '<pre class="mermaidCodeView"><code>' + 
                    this._escapeHtml(sMermaidCode || "暂无 Mermaid 代码") + 
                    '</code></pre>';
            } else {
                // 预览模式 - 重新渲染
                if (sMermaidCode) {
                    this._renderMermaid(sMermaidCode);
                } else {
                    this._oContentWrapper.innerHTML = 
                        '<div class="diagramPlaceholder">' +
                        '<span class="sapUiIcon" style="font-family:SAP-icons;font-size:4rem;color:#bbb;">&#xe145;</span>' +
                        '<p>输入描述并点击生成按钮来创建流程图</p>' +
                        '</div>';
                }
            }
        },
        
        /**
         * 缩放控制
         */
        onZoomIn: function () {
            var oModel = this.getView().getModel("diagram");
            var nZoom = oModel.getProperty("/zoomLevel");
            nZoom = Math.min(nZoom + this._ZOOM_STEP, this._MAX_ZOOM);
            oModel.setProperty("/zoomLevel", nZoom);
            this._applyZoom(nZoom);
        },
        
        onZoomOut: function () {
            var oModel = this.getView().getModel("diagram");
            var nZoom = oModel.getProperty("/zoomLevel");
            nZoom = Math.max(nZoom - this._ZOOM_STEP, this._MIN_ZOOM);
            oModel.setProperty("/zoomLevel", nZoom);
            this._applyZoom(nZoom);
        },
        
        onResetZoom: function () {
            var oModel = this.getView().getModel("diagram");
            oModel.setProperty("/zoomLevel", 1);
            this._applyZoom(1);
            
            // 重置滚动位置
            if (this._oPreviewArea) {
                this._oPreviewArea.scrollLeft = 0;
                this._oPreviewArea.scrollTop = 0;
            }
        },
        
        /**
         * 应用缩放 - 同时调整容器大小
         */
        _applyZoom: function (nZoom) {
            var oRenderContainer = this._oContentWrapper ? 
                this._oContentWrapper.querySelector(".mermaidRenderContainer") : null;
            
            if (oRenderContainer && this._oRenderedSvg) {
                // 获取 SVG 原始尺寸
                var oSvg = this._oRenderedSvg;
                
                // 如果没有保存原始尺寸，先保存
                if (!this._nOriginalWidth) {
                    var oRect = oSvg.getBoundingClientRect();
                    // 考虑当前可能已有的缩放
                    var oModel = this.getView().getModel("diagram");
                    var nCurrentZoom = oModel.getProperty("/zoomLevel") || 1;
                    this._nOriginalWidth = oRect.width / nCurrentZoom;
                    this._nOriginalHeight = oRect.height / nCurrentZoom;
                }
                
                // 计算缩放后的尺寸
                var nNewWidth = this._nOriginalWidth * nZoom;
                var nNewHeight = this._nOriginalHeight * nZoom;
                
                // 设置 SVG 尺寸
                oSvg.style.width = nNewWidth + "px";
                oSvg.style.height = nNewHeight + "px";
                oSvg.style.transform = "none"; // 不使用 transform，直接改尺寸
                
                // 调整容器大小以适应
                oRenderContainer.style.width = "auto";
                oRenderContainer.style.height = "auto";
                oRenderContainer.style.display = "inline-block";
            }
        },
        
        /**
         * 下载 PNG
         */
        onDownloadPNG: function () {
            var that = this;
            
            if (!this._oRenderedSvg) {
                MessageToast.show(this._getI18nText("noImageToDownload"));
                return;
            }
            
            this._svgToPng(this._oRenderedSvg, function (sDataUrl) {
                that._downloadFile(sDataUrl, "diagram-" + Date.now() + ".png");
                MessageToast.show(that._getI18nText("downloadStarted"));
            });
        },
        
        /**
         * 下载 SVG
         */
        onDownloadSVG: function () {
            if (!this._oRenderedSvg) {
                MessageToast.show(this._getI18nText("noImageToDownload"));
                return;
            }
            
            var sSvgData = new XMLSerializer().serializeToString(this._oRenderedSvg);
            var oBlob = new Blob([sSvgData], { type: "image/svg+xml;charset=utf-8" });
            var sUrl = URL.createObjectURL(oBlob);
            
            this._downloadFile(sUrl, "diagram-" + Date.now() + ".svg");
            URL.revokeObjectURL(sUrl);
            
            MessageToast.show(this._getI18nText("downloadStarted"));
        },
        
        /**
         * 复制图片到剪贴板
         */
        onCopyImage: function () {
            var that = this;
            
            if (!this._oRenderedSvg) {
                MessageToast.show(this._getI18nText("noImageToCopy"));
                return;
            }
            
            // 检查剪贴板 API
            if (!navigator.clipboard || !navigator.clipboard.write) {
                MessageToast.show(this._getI18nText("clipboardNotSupported"));
                return;
            }
            
            this._svgToPng(this._oRenderedSvg, function (sDataUrl) {
                fetch(sDataUrl)
                    .then(function (res) { return res.blob(); })
                    .then(function (blob) {
                        var item = new ClipboardItem({ "image/png": blob });
                        return navigator.clipboard.write([item]);
                    })
                    .then(function () {
                        MessageToast.show(that._getI18nText("imageCopied"));
                    })
                    .catch(function (error) {
                        console.error("[Diagram] 复制图片失败:", error);
                        MessageToast.show(that._getI18nText("copyImageFailed"));
                    });
            });
        },
        
        /**
         * SVG 转 PNG
         */
        _svgToPng: function (oSvg, fnCallback) {
            var sSvgData = new XMLSerializer().serializeToString(oSvg);
            var oCanvas = document.createElement("canvas");
            var oCtx = oCanvas.getContext("2d");
            var oImg = new Image();
            
            // 获取尺寸
            var oRect = oSvg.getBoundingClientRect();
            var nWidth = oRect.width || oSvg.viewBox.baseVal.width || 800;
            var nHeight = oRect.height || oSvg.viewBox.baseVal.height || 600;
            
            // 2倍分辨率
            var nScale = 2;
            oCanvas.width = nWidth * nScale;
            oCanvas.height = nHeight * nScale;
            oCtx.scale(nScale, nScale);
            
            // 白色背景
            oCtx.fillStyle = "#ffffff";
            oCtx.fillRect(0, 0, nWidth, nHeight);
            
            oImg.onload = function () {
                oCtx.drawImage(oImg, 0, 0, nWidth, nHeight);
                fnCallback(oCanvas.toDataURL("image/png"));
            };
            
            oImg.onerror = function () {
                console.error("[Diagram] SVG 转 PNG 失败");
            };
            
            var sSvgBase64 = btoa(unescape(encodeURIComponent(sSvgData)));
            oImg.src = "data:image/svg+xml;base64," + sSvgBase64;
        },
        
        /**
         * 下载文件
         */
        _downloadFile: function (sUrl, sFilename) {
            var oLink = document.createElement("a");
            oLink.download = sFilename;
            oLink.href = sUrl;
            document.body.appendChild(oLink);
            oLink.click();
            document.body.removeChild(oLink);
        },

        /**
         * 在 Draw.io 中打开编辑
         * 使用 embed.diagrams.net 嵌入模式，配置完整功能
         */
        onOpenInDrawio: function () {
            var that = this;
            var oModel = this.getView().getModel("diagram");
            var sMermaidCode = oModel.getProperty("/mermaidCode");
            
            if (!sMermaidCode) {
                MessageToast.show(this._getI18nText("noMermaidCode"));
                return;
            }
            
            // 先复制 Mermaid 代码到剪贴板
            navigator.clipboard.writeText(sMermaidCode).then(function() {
                MessageToast.show("Mermaid 代码已复制，请在编辑器中 Arrange → Insert → Advanced → Mermaid 粘贴");
            }).catch(function() {
                console.warn("[Diagram] 复制失败");
            });
            
            // 创建对话框
            if (!this._oDrawioDialog) {
                this._oDrawioDialog = sap.ui.xmlfragment(
                    this.getView().getId(),
                    "com.ai.assistant.aichatapp.view.DrawioDialog",
                    this
                );
                this.getView().addDependent(this._oDrawioDialog);
            }
            
            this._oDrawioDialog.open();
            
            setTimeout(function () {
                that._initDrawioEmbed();
            }, 300);
        },
        
        /**
         * 初始化 Draw.io 嵌入版
         * 使用更完整的配置参数启用更多功能
         */
        _initDrawioEmbed: function () {
            var that = this;
            
            var oIframeBox = sap.ui.core.Fragment.byId(this.getView().getId(), "drawioIframeBox");
            if (!oIframeBox) return;
            
            var oDomRef = oIframeBox.getDomRef();
            if (!oDomRef) {
                setTimeout(function() { that._initDrawioEmbed(); }, 200);
                return;
            }
            
            oDomRef.innerHTML = "";
            var oIframe = document.createElement("iframe");
            oIframe.id = this.getView().getId() + "--drawioFrame";
            oIframe.style.cssText = "width:100%;height:100%;min-height:600px;border:none;background:#fff;";
            oIframe.setAttribute("allowfullscreen", "true");
            oIframe.setAttribute("allow", "clipboard-read; clipboard-write");
            oDomRef.appendChild(oIframe);
            
            this._oDrawioIframe = oIframe;
            
            // 使用 embed.diagrams.net 但启用更多功能
            // ui=kennedy 使用经典亮色主题界面
            // libraries=1 启用形状库
            var sUrl = "https://embed.diagrams.net/?embed=1&proto=json&spin=1" +
                "&ui=kennedy" +         // 经典亮色 UI 主题
                "&libraries=1" +        // 启用形状库
                "&noSaveBtn=0" +        // 显示保存按钮
                "&saveAndExit=0" +      // 不自动退出
                "&noExitBtn=1";         // 隐藏退出按钮（我们有自己的关闭按钮）
            
            oIframe.src = sUrl;
            
            // 监听 Draw.io 消息
            this._fnDrawioHandler = function(event) {
                if (event.origin !== "https://embed.diagrams.net") return;
                try {
                    var msg = JSON.parse(event.data);
                    that._handleDrawioMsg(msg);
                } catch(e) {}
            };
            window.addEventListener("message", this._fnDrawioHandler);
        },
        
        /**
         * 处理 Draw.io 消息
         */
        _handleDrawioMsg: function(msg) {
            var oIframe = this._oDrawioIframe;
            if (!oIframe || !oIframe.contentWindow) return;
            
            switch(msg.event) {
                case "configure":
                    // 配置 Draw.io
                    oIframe.contentWindow.postMessage(JSON.stringify({
                        action: "configure",
                        config: {
                            css: ".geMenubarContainer { background: #f5f5f5 !important; }",
                            defaultFonts: ["Microsoft YaHei", "SimHei", "Arial"],
                            // 启用更多功能
                            enabledLibraries: ["general", "basic", "arrows2", "flowchart", "uml"]
                        }
                    }), "*");
                    break;
                    
                case "init":
                    // 初始化完成，加载空白图
                    oIframe.contentWindow.postMessage(JSON.stringify({
                        action: "load",
                        xml: "",
                        autosave: 0
                    }), "*");
                    break;
                    
                case "export":
                    this._handleDrawioExport(msg);
                    break;
                    
                case "save":
                    MessageToast.show("图表已保存");
                    break;
                    
                case "exit":
                    this.onCloseDrawio();
                    break;
            }
        },
        
        /**
         * 处理导出
         */
        _handleDrawioExport: function(msg) {
            if (msg.format === "png" && msg.data) {
                this._downloadFile(msg.data, "diagram-" + Date.now() + ".png");
                MessageToast.show(this._getI18nText("exportSuccess"));
            } else if (msg.format === "svg" && msg.data) {
                this._downloadFile(msg.data, "diagram-" + Date.now() + ".svg");
                MessageToast.show(this._getI18nText("exportSuccess"));
            }
        },
        
        /**
         * 导出 PNG
         */
        onDrawioExportPNG: function() {
            if (this._oDrawioIframe && this._oDrawioIframe.contentWindow) {
                this._oDrawioIframe.contentWindow.postMessage(JSON.stringify({
                    action: "export",
                    format: "png",
                    scale: 2,
                    background: "#ffffff"
                }), "*");
            }
        },
        
        /**
         * 导出 SVG
         */
        onDrawioExportSVG: function() {
            if (this._oDrawioIframe && this._oDrawioIframe.contentWindow) {
                this._oDrawioIframe.contentWindow.postMessage(JSON.stringify({
                    action: "export",
                    format: "svg"
                }), "*");
            }
        },
        
        /**
         * 复制图片
         */
        onDrawioCopyImage: function() {
            var that = this;
            if (!this._oDrawioIframe || !this._oDrawioIframe.contentWindow) return;
            
            var fnHandler = function(event) {
                if (event.origin !== "https://embed.diagrams.net") return;
                try {
                    var msg = JSON.parse(event.data);
                    if (msg.event === "export" && msg.format === "png" && msg.data) {
                        window.removeEventListener("message", fnHandler);
                        fetch(msg.data)
                            .then(function(r) { return r.blob(); })
                            .then(function(blob) {
                                return navigator.clipboard.write([new ClipboardItem({"image/png": blob})]);
                            })
                            .then(function() {
                                MessageToast.show(that._getI18nText("imageCopied"));
                            })
                            .catch(function() {
                                MessageToast.show(that._getI18nText("copyImageFailed"));
                            });
                    }
                } catch(e) {}
            };
            window.addEventListener("message", fnHandler);
            
            this._oDrawioIframe.contentWindow.postMessage(JSON.stringify({
                action: "export", format: "png", scale: 2, background: "#ffffff"
            }), "*");
        },
        
        /**
         * 关闭 Draw.io
         */
        onCloseDrawio: function() {
            if (this._oDrawioDialog) {
                this._oDrawioDialog.close();
            }
            if (this._fnDrawioHandler) {
                window.removeEventListener("message", this._fnDrawioHandler);
                this._fnDrawioHandler = null;
            }
            if (this._oDrawioIframe) {
                this._oDrawioIframe.src = "about:blank";
                this._oDrawioIframe = null;
            }
        },
        
        /**
         * 获取 i18n 文本
         */
        _getI18nText: function (sKey) {
            var oI18n = this.getView().getModel("i18n");
            if (oI18n) {
                return oI18n.getResourceBundle().getText(sKey);
            }
            return sKey;
        },
        
        /**
         * HTML 转义
         */
        _escapeHtml: function (sText) {
            if (!sText) return "";
            var oDiv = document.createElement("div");
            oDiv.textContent = sText;
            return oDiv.innerHTML;
        },
        
        /**
         * 控制器销毁
         */
        onExit: function () {
            // 清理资源
        }
    });
});
