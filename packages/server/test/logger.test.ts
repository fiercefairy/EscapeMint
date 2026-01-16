import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// We need to test the logger module with different LOG_LEVEL values
// Since the module caches LOG_LEVEL at load time, we need to reset modules between tests

describe('logger', () => {
  const originalEnv = process.env['LOG_LEVEL']
  let consoleSpy: {
    log: ReturnType<typeof vi.spyOn>
    warn: ReturnType<typeof vi.spyOn>
    error: ReturnType<typeof vi.spyOn>
  }

  beforeEach(() => {
    consoleSpy = {
      log: vi.spyOn(console, 'log').mockImplementation(() => {}),
      warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
      error: vi.spyOn(console, 'error').mockImplementation(() => {})
    }
  })

  afterEach(() => {
    vi.resetModules()
    vi.restoreAllMocks()
    if (originalEnv === undefined) {
      delete process.env['LOG_LEVEL']
    } else {
      process.env['LOG_LEVEL'] = originalEnv
    }
  })

  describe('with default log level (info)', () => {
    beforeEach(async () => {
      delete process.env['LOG_LEVEL']
      vi.resetModules()
    })

    it('logs info messages', async () => {
      const { createLogger } = await import('../src/utils/logger.js')
      const log = createLogger('test')
      log.info('test message')
      expect(consoleSpy.log).toHaveBeenCalledTimes(1)
      expect(consoleSpy.log.mock.calls[0][0]).toContain('[INFO]')
      expect(consoleSpy.log.mock.calls[0][0]).toContain('[test]')
      expect(consoleSpy.log.mock.calls[0][0]).toContain('test message')
    })

    it('logs warn messages', async () => {
      const { createLogger } = await import('../src/utils/logger.js')
      const log = createLogger('test')
      log.warn('warning message')
      expect(consoleSpy.warn).toHaveBeenCalledTimes(1)
      expect(consoleSpy.warn.mock.calls[0][0]).toContain('[WARN]')
    })

    it('logs error messages', async () => {
      const { createLogger } = await import('../src/utils/logger.js')
      const log = createLogger('test')
      log.error('error message')
      expect(consoleSpy.error).toHaveBeenCalledTimes(1)
      expect(consoleSpy.error.mock.calls[0][0]).toContain('[ERROR]')
    })

    it('does not log debug messages at info level', async () => {
      const { createLogger } = await import('../src/utils/logger.js')
      const log = createLogger('test')
      log.debug('debug message')
      expect(consoleSpy.log).not.toHaveBeenCalled()
    })
  })

  describe('with debug log level', () => {
    beforeEach(async () => {
      process.env['LOG_LEVEL'] = 'debug'
      vi.resetModules()
    })

    it('logs debug messages', async () => {
      const { createLogger } = await import('../src/utils/logger.js')
      const log = createLogger('test')
      log.debug('debug message')
      expect(consoleSpy.log).toHaveBeenCalledTimes(1)
      expect(consoleSpy.log.mock.calls[0][0]).toContain('[DEBUG]')
    })

    it('logs all levels', async () => {
      const { createLogger } = await import('../src/utils/logger.js')
      const log = createLogger('test')
      log.debug('d')
      log.info('i')
      log.warn('w')
      log.error('e')
      expect(consoleSpy.log).toHaveBeenCalledTimes(2) // debug + info
      expect(consoleSpy.warn).toHaveBeenCalledTimes(1)
      expect(consoleSpy.error).toHaveBeenCalledTimes(1)
    })
  })

  describe('with warn log level', () => {
    beforeEach(async () => {
      process.env['LOG_LEVEL'] = 'warn'
      vi.resetModules()
    })

    it('does not log debug or info messages', async () => {
      const { createLogger } = await import('../src/utils/logger.js')
      const log = createLogger('test')
      log.debug('debug')
      log.info('info')
      expect(consoleSpy.log).not.toHaveBeenCalled()
    })

    it('logs warn and error messages', async () => {
      const { createLogger } = await import('../src/utils/logger.js')
      const log = createLogger('test')
      log.warn('w')
      log.error('e')
      expect(consoleSpy.warn).toHaveBeenCalledTimes(1)
      expect(consoleSpy.error).toHaveBeenCalledTimes(1)
    })
  })

  describe('with error log level', () => {
    beforeEach(async () => {
      process.env['LOG_LEVEL'] = 'error'
      vi.resetModules()
    })

    it('only logs error messages', async () => {
      const { createLogger } = await import('../src/utils/logger.js')
      const log = createLogger('test')
      log.debug('d')
      log.info('i')
      log.warn('w')
      log.error('e')
      expect(consoleSpy.log).not.toHaveBeenCalled()
      expect(consoleSpy.warn).not.toHaveBeenCalled()
      expect(consoleSpy.error).toHaveBeenCalledTimes(1)
    })
  })

  describe('with silent log level', () => {
    beforeEach(async () => {
      process.env['LOG_LEVEL'] = 'silent'
      vi.resetModules()
    })

    it('logs nothing', async () => {
      const { createLogger } = await import('../src/utils/logger.js')
      const log = createLogger('test')
      log.debug('d')
      log.info('i')
      log.warn('w')
      log.error('e')
      expect(consoleSpy.log).not.toHaveBeenCalled()
      expect(consoleSpy.warn).not.toHaveBeenCalled()
      expect(consoleSpy.error).not.toHaveBeenCalled()
    })
  })

  describe('message formatting', () => {
    beforeEach(async () => {
      delete process.env['LOG_LEVEL']
      vi.resetModules()
    })

    it('includes timestamp in ISO format', async () => {
      const { createLogger } = await import('../src/utils/logger.js')
      const log = createLogger('test')
      log.info('message')
      const output = consoleSpy.log.mock.calls[0][0] as string
      // Check for ISO timestamp pattern
      expect(output).toMatch(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\]/)
    })

    it('includes context in message', async () => {
      const { createLogger } = await import('../src/utils/logger.js')
      const log = createLogger('my-context')
      log.info('message')
      expect(consoleSpy.log.mock.calls[0][0]).toContain('[my-context]')
    })

    it('passes additional arguments through', async () => {
      const { createLogger } = await import('../src/utils/logger.js')
      const log = createLogger('test')
      const extra = { foo: 'bar' }
      log.info('message', extra)
      expect(consoleSpy.log).toHaveBeenCalledWith(expect.any(String), extra)
    })
  })

  describe('invalid log level', () => {
    beforeEach(async () => {
      process.env['LOG_LEVEL'] = 'invalid'
      vi.resetModules()
    })

    it('defaults to info level for invalid values', async () => {
      const { createLogger } = await import('../src/utils/logger.js')
      const log = createLogger('test')
      log.debug('should not appear')
      log.info('should appear')
      expect(consoleSpy.log).toHaveBeenCalledTimes(1)
      expect(consoleSpy.log.mock.calls[0][0]).toContain('[INFO]')
    })
  })

  describe('default logger export', () => {
    beforeEach(async () => {
      delete process.env['LOG_LEVEL']
      vi.resetModules()
    })

    it('provides a pre-configured server logger', async () => {
      const { logger } = await import('../src/utils/logger.js')
      logger.info('test')
      expect(consoleSpy.log.mock.calls[0][0]).toContain('[server]')
    })
  })
})
