/**
 * macOS Keychain utilities for secure API credential storage.
 * Uses the `security` CLI tool to interact with the system keychain.
 *
 * All credentials are stored under the service name 'escapemint-coinbase'.
 */

import { exec } from 'node:child_process'
import { promisify } from 'node:util'

const execAsync = promisify(exec)

const SERVICE_NAME = 'escapemint-coinbase'

interface StoredCredentials {
  apiKey: string
  apiSecret: string
}

/**
 * Store API credentials in macOS Keychain.
 *
 * @param keyName - Display name for the credential set
 * @param apiKey - Coinbase API key ID
 * @param apiSecret - Coinbase API secret (private key)
 */
export const storeApiKey = async (
  keyName: string,
  apiKey: string,
  apiSecret: string
): Promise<void> => {
  // JSON encode the credentials
  const credentials = JSON.stringify({ apiKey, apiSecret })

  // Escape special characters for shell
  const escapedCredentials = credentials
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\$/g, '\\$')
    .replace(/`/g, '\\`')

  // -U flag updates if exists, creates if not
  const command = `security add-generic-password -a "${keyName}" -s "${SERVICE_NAME}" -w "${escapedCredentials}" -U`

  await execAsync(command)
}

/**
 * Retrieve API credentials from macOS Keychain.
 *
 * @param keyName - Name of the credential set to retrieve
 * @returns The stored credentials, or null if not found
 */
export const getApiKey = async (keyName: string): Promise<StoredCredentials | null> => {
  const command = `security find-generic-password -a "${keyName}" -s "${SERVICE_NAME}" -w`

  const result = await execAsync(command).catch((error: unknown) => {
    // Log for diagnostics but treat failures as "no credentials found"
    // (keychain locked, key missing, or other error all return empty)
    console.debug(`Keychain lookup failed for "${keyName}":`, error instanceof Error ? error.message : error)
    return { stdout: '', stderr: '' }
  })

  const output = result.stdout.trim()
  if (!output) return null

  return JSON.parse(output) as StoredCredentials
}

/**
 * Delete API credentials from macOS Keychain.
 *
 * @param keyName - Name of the credential set to delete
 */
export const deleteApiKey = async (keyName: string): Promise<void> => {
  const command = `security delete-generic-password -a "${keyName}" -s "${SERVICE_NAME}"`

  // Ignore errors if key doesn't exist
  await execAsync(command).catch(() => {})
}

/**
 * List all stored API key names from Keychain.
 *
 * @returns Array of stored key names
 */
export const listApiKeys = async (): Promise<string[]> => {
  // Dump keychain and filter for our service
  // This is a bit hacky but security CLI doesn't have a clean list command
  const command = `security dump-keychain 2>/dev/null | grep -A 5 '"${SERVICE_NAME}"' | grep '"acct"' | sed 's/.*="\\(.*\\)"/\\1/' | sort -u`

  const result = await execAsync(command).catch(() => ({ stdout: '' }))

  return result.stdout
    .trim()
    .split('\n')
    .filter(Boolean)
}

/**
 * Test if we can access the keychain (not locked).
 *
 * @returns true if keychain is accessible
 */
export const testKeychainAccess = async (): Promise<boolean> => {
  const command = 'security show-keychain-info 2>&1'

  const result = await execAsync(command).catch(() => ({ stdout: '' }))

  // If keychain is locked, output contains "SecKeychainGetStatus"
  return !result.stdout.includes('SecKeychainGetStatus')
}

/**
 * Verify that stored credentials are valid (can be retrieved and parsed).
 *
 * @param keyName - Name of the credential set to verify
 * @returns true if credentials exist and are valid JSON
 */
export const verifyApiKey = async (keyName: string): Promise<boolean> => {
  const creds = await getApiKey(keyName)
  return creds !== null && !!creds.apiKey && !!creds.apiSecret
}
