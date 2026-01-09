import { useState, useMemo } from 'react'
import { toast } from 'sonner'
import { updateFundEntry, deleteFundEntry, type FundEntry, type FundDetail, type FundType } from '../api/funds'
import { EntryForm, buildEntryFromForm, createFormDataFromEntry, parseDepositFromNotes, parseWithdrawalFromNotes, type EntryFormData } from './EntryForm'

export interface EditEntryModalProps {
  fundId: string
  fundTicker: string
  entryIndex: number
  entry: FundEntry
  existingEntries?: FundEntry[]
  calculatedFundSize?: number | undefined
  fundType?: FundType | undefined
  manageCash?: boolean | undefined
  onClose: () => void
  onUpdated: (fund?: FundDetail) => void
}

export function EditEntryModal({ fundId, fundTicker, entryIndex, entry, existingEntries = [], calculatedFundSize, fundType = 'stock', manageCash = true, onClose, onUpdated }: EditEntryModalProps) {
  const [loading, setLoading] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  // Track the base fund size (before any adjustments)
  const baseFundSize = useMemo(() => {
    const fundSize = entry.fund_size ?? calculatedFundSize ?? 0
    const existingDeposit = parseFloat(parseDepositFromNotes(entry.notes)) || 0
    const existingWithdrawal = parseFloat(parseWithdrawalFromNotes(entry.notes)) || 0
    const existingDividend = entry.dividend ?? 0
    const existingExpense = entry.expense ?? 0
    const existingCashInterest = entry.cash_interest ?? 0
    const existingAdjustment = existingDeposit - existingWithdrawal + existingDividend - existingExpense + existingCashInterest
    return fundSize - existingAdjustment
  }, [entry.fund_size, calculatedFundSize, entry.notes, entry.dividend, entry.expense, entry.cash_interest])

  const [formData, setFormData] = useState<EntryFormData>(() =>
    createFormDataFromEntry(entry, calculatedFundSize, fundType)
  )

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    const updatedEntry = buildEntryFromForm(formData, fundType) as FundEntry
    const response = await updateFundEntry(fundId, entryIndex, updatedEntry)

    if (response.error) {
      toast.error(response.error)
    } else {
      toast.success('Entry updated')
      onUpdated(response.data?.fund)
      onClose()
    }

    setLoading(false)
  }

  const handleDelete = async () => {
    setDeleting(true)
    const response = await deleteFundEntry(fundId, entryIndex)
    if (response.error) {
      toast.error(response.error)
    } else {
      toast.success('Entry deleted')
      onUpdated(response.data?.fund)
      onClose()
    }
    setDeleting(false)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-slate-800 rounded-lg p-6 w-full max-w-4xl border border-slate-700 max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-bold text-white mb-2">Edit Entry</h2>
        <p className="text-slate-400 text-sm mb-4">Update entry for {fundTicker.toUpperCase()}</p>

        <form onSubmit={handleSubmit}>
          <EntryForm
            formData={formData}
            setFormData={setFormData}
            existingEntries={existingEntries}
            baseFundSize={baseFundSize}
            showFundSizeAdjustment={true}
            fundType={fundType}
            manageCash={manageCash}
          />

          {/* Buttons */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 bg-mint-600 text-white rounded-lg hover:bg-mint-700 transition-colors disabled:opacity-50"
            >
              {loading ? 'Saving...' : 'Save Changes'}
            </button>
          </div>

          {/* Delete Section */}
          <div className="border-t border-slate-700 pt-4 mt-4">
            {showDeleteConfirm ? (
              <div className="bg-red-900/20 border border-red-800 rounded-lg p-3">
                <p className="text-sm text-red-300 mb-3">Are you sure you want to delete this entry? This cannot be undone.</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowDeleteConfirm(false)}
                    className="flex-1 px-3 py-1.5 text-sm bg-slate-700 text-white rounded hover:bg-slate-600 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={deleting}
                    className="flex-1 px-3 py-1.5 text-sm bg-red-600 text-white rounded hover:bg-red-700 transition-colors disabled:opacity-50"
                  >
                    {deleting ? 'Deleting...' : 'Confirm Delete'}
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                className="w-full px-4 py-2 text-sm text-red-400 hover:text-red-300 hover:bg-red-900/20 rounded-lg transition-colors"
              >
                Delete Entry
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}
