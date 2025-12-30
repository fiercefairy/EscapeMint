import { useParams } from 'react-router-dom'

export function SubFundDetail() {
  const { id } = useParams()

  return (
    <div>
      <h1 className="text-3xl font-bold text-white mb-4">SubFund Details</h1>
      <p className="text-slate-400">SubFund ID: {id}</p>
      <p className="text-slate-400 mt-4">Full implementation coming soon...</p>
    </div>
  )
}
