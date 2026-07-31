/**
 * 应用入口文件
 *
 * 负责：
 * 1. 导入全局样式（Tailwind CSS + 自定义样式）
 * 2. 挂载 React 应用到 #root DOM 节点
 * 3. 使用 StrictMode 进行开发时的额外检查
 *
 * StrictMode 会在开发模式下双重调用某些生命周期方法，
 * 帮助发现副作用相关的问题，不影响生产构建。
 *
 * @module main
 */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';

// 获取根 DOM 节点并渲染 React 应用
// `!` 非空断言：确保 #root 元素一定存在于 HTML 中
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
