# AI 助手平台

> **版本**: v1.4.3  
> **技术栈**: SAP CAP (Node.js) + SAP UI5 Freestyle + 阿里云百炼 AI

---

## 📋 项目简介

AI 助手平台是一个基于 **SAP CAP** 框架和 **SAP UI5 Freestyle** 前端技术构建的企业级 AI 智能助手应用。集成了**阿里云百炼（DashScope）** 大语言模型 API，为 SAP 开发人员提供多种 AI 辅助工具。

### 核心功能

| 功能模块 | 描述 |
|---------|------|
| ABAP Clean Core 助手 | 帮助重构传统 ABAP 代码为云就绪代码 |
| CPI 集成助手 | SAP CPI Integration Suite 开发指导 |
| 功能文档生成 | 自动生成功能规格说明文档 |
| 技术文档生成 | 自动生成技术设计文档 |
| 代码审查助手 | 智能代码质量检查 |
| 单元测试生成 | 自动生成 ABAP 单元测试代码 |
| 流程图生成 | AI 驱动的 Mermaid 流程图/架构图生成 |
| 文件上传分析 | 上传 PDF/Word/Excel 等文档供 AI 分析 |

---

## 🚀 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

```bash
# 新建 .env 文件（参考下方示例）
# Windows: type nul > .env
# macOS/Linux: touch .env

# 编辑 .env 文件，填写 API 密钥
```

**必需配置**:
```bash
DASHSCOPE_API_KEY=sk-xxxxxxxxxxxxxxxx
DASHSCOPE_APP_ID=xxxxxxxx

# 各 AI 助手的应用 ID（可选，如未配置则使用默认 ID）
DASHSCOPE_APP_ID_ABAP=xxxxxxxx
DASHSCOPE_APP_ID_CPI=xxxxxxxx
DASHSCOPE_APP_ID_FUNC_DOC=xxxxxxxx
DASHSCOPE_APP_ID_TECH_DOC=xxxxxxxx
DASHSCOPE_APP_ID_CODE_REVIEW=xxxxxxxx
DASHSCOPE_APP_ID_UNIT_TEST=xxxxxxxx
DASHSCOPE_APP_ID_DIAGRAM=xxxxxxxx
```

**文件上传功能配置（可选）**:
```bash
BAILIAN_ACCESS_KEY_ID=LTAI5txxxxxxxxxx
BAILIAN_ACCESS_KEY_SECRET=xxxxxxxxxx
BAILIAN_WORKSPACE_ID=llm-njsp72bv281ofywg
```

### 3. 启动开发服务器

```bash
npm run dev
```

访问 http://localhost:4004/ai-chat-gui/webapp/index.html

---

## 📁 目录结构

```
├── app/                    # 前端应用
│   └── ai-chat-gui/        # UI5 聊天应用
├── srv/                    # 后端服务
│   ├── server.js           # 自定义服务器（流式响应）
│   └── chat-service.cds    # CDS 服务定义
├── docs/                   # 项目文档
├── package.json            # 项目配置
├── mta.yaml                # MTA 部署描述符
└── xs-security.json        # XSUAA 安全配置
```

---

## 📖 详细文档

- [项目说明文档](./docs/项目说明文档.md) - 详细的项目综合说明
- [API 接口文档](./docs/分模块与前后端说明/API接口文档.md) - 完整的 API 规范
- [部署指南](./docs/分模块与前后端说明/部署指南.md) - 构建与部署流程
- [更多文档](./docs/分模块与前后端说明/README.md) - 分模块详细说明

---

## 🛠️ 常用命令

| 命令 | 描述 |
|-----|------|
| `npm run dev` | 启动开发服务器 |
| `npm run start` | 生产模式启动 |
| `npm run build` | 构建 MTA 包 |
| `npm run deploy` | 部署到 Cloud Foundry |
| `npm run undeploy` | 从 Cloud Foundry 卸载 |
| `npm run watch-ai-chat-gui` | 启动 cds watch（禁用 livereload，仍会启动后端） |

---

## 📋 技术要求

- **Node.js**: >= 18.0.0
- **SAP UI5**: >= 1.120.0
- **@sap/cds**: ^9

---

## 📄 许可证

本项目仅供内部使用。
