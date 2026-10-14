/**
 * 极简事件总线：把单元状态流转广播给 SSE 订阅者，并保留一小段历史，
 * 让中途接入（或刷新页面后重连）的客户端能立刻看到最近的状态。
 *
 * 纯 Node，无 DSH 依赖。
 */

/**
 * @param {{ historySize?: number }} [options]
 */
export function createBus(options = {}) {
  const historySize = Number.isFinite(options.historySize) ? options.historySize : 500
  const listeners = new Set()
  const history = []

  return {
    /** @param {object} frame */
    publish(frame) {
      // 新的一次表决开始 ⇒ 清空回放缓冲。中途接入（或刷新页面重连）的客户端
      // 只需要看到「当前这一次」的完整帧序列，而不是历史上每一次表决的碎片。
      if (frame?.type === 'vote') history.length = 0
      history.push(frame)
      if (history.length > historySize) history.splice(0, history.length - historySize)
      for (const listener of [...listeners]) {
        try {
          listener(frame)
        } catch {
          // 单个订阅者出错不应影响其他人
        }
      }
    },
    /** @param {(frame: object) => void} listener */
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    recent() {
      return [...history]
    },
    get size() {
      return listeners.size
    },
  }
}
