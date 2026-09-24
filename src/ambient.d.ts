/**
 * 构建期常量：由 scripts/build.mjs 的 esbuild define 注入。
 * 声明必须保留——否则 tsc --noEmit 会报 "Cannot find name '__DEV__'"。
 */

/** 是否为开发构建（npm run build:dev）。生产构建下诊断日志代码被消除。 */
declare const __DEV__: boolean;

/** 插件版本号，取自 package.json.version。 */
declare const __PLUGIN_VERSION__: string;
