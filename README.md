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
| FSD to TSD 助手 (I/E) | 功能设计文档转技术设计文档（实施/增强方向），支持独立 API Key |
| 技术文档生成 | 自动生成技术设计文档 |
| 代码审查助手 | 智能代码质量检查 |
| 单元测试生成 | 自动生成 ABAP 单元测试代码 |
| 流程图生成 | AI 驱动的 Mermaid 流程图/架构图生成 |
| 文件极速解析 | 纯前端本地解析 PDF/Word/Excel 等文档，无需后端依赖 |

---

## 🚀 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

```bash
# 创建 .env 文件并填写 API 密钥
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

# FSD to TSD 助手（支持独立 API Key）
DASHSCOPE_APP_ID_FSD2TSD_I=xxxxxxxx
DASHSCOPE_API_KEY_FSD2TSD_I=sk-xxxxxxxx
DASHSCOPE_APP_ID_FSD2TSD_E=xxxxxxxx
DASHSCOPE_API_KEY_FSD2TSD_E=sk-xxxxxxxx
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
│   ├── server.js           # 自定义服务器（流式代理网关）
│   └── chat-service.cds    # CDS 服务定义
├── docs/                   # 项目文档
├── package.json            # 项目配置
├── mta.yaml                # MTA 部署描述符
└── xs-security.json        # XSUAA 安全配置
```

---

## 📖 详细文档

- [项目技术文档](./docs/项目技术文档.md) - 完整的架构、前后端、配置说明
- [API 接口文档](./docs/API接口文档.md) - API 规范与使用示例
- [部署指南](./docs/部署指南.md) - 构建与部署到 SAP BTP 全流程
- [成本与路线图](./docs/成本与路线图.md) - 费用估算与后续规划

---

## 🛠️ 常用命令

| 命令 | 描述 |
|-----|------|
| `npm run dev` | 启动开发服务器 |
| `npm run start` | 生产模式启动 |
| `npm run build` | 构建 MTA 包 |
| `npm run deploy` | 部署到 Cloud Foundry |
| `npm run undeploy` | 从 Cloud Foundry 卸载 |

---

## 📋 技术要求

- **Node.js**: >= 18.0.0
- **SAP UI5**: >= 1.120.0
- **@sap/cds**: ^9

---

## 📄 许可证

本项目仅供内部使用。
