// CloudBase 环境配置
// 部署前请将下面的环境ID替换为你的CloudBase环境ID
// 获取方式：腾讯云控制台 → 云开发 CloudBase → 环境概览 → 环境ID
const IS_GITHUB_PAGES = location.hostname.endsWith('github.io');
const CLOUDBASE_ENV_ID = IS_GITHUB_PAGES ? 'your-env-id' : 'ai-survey-d7gqni9skb1d043ce';
