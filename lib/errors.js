/**
 * 错误文本归一化：日志与 HTTP 响应都只需要一行可读信息。
 * 单独成文件是为了让各个 lib 模块共用同一套转换，而不是各写一遍三元表达式。
 */

/** @param {unknown} error */
export const errorMessage = (error) => (error instanceof Error ? error.message : String(error))
