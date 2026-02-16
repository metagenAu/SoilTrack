'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import FolderUpload from '@/components/data-hub/FolderUpload'
import SingleFileUpload from '@/components/data-hub/SingleFileUpload'
import PasteData from '@/components/data-hub/PasteData'
import UploadLog from '@/components/data-hub/UploadLog'
import { FolderUp, FileUp, ClipboardPaste } from 'lucide-react'

const tabs = [
  { key: 'folder', label: 'Trial Folder', icon: FolderUp },
  { key: 'single', label: 'Single File', icon: FileUp },
  { key: 'paste', label: 'Paste Data', icon: ClipboardPaste },
]

interface DataHubClientProps {
  trials: { id: string; name: string }[]
  uploadLog: any[]
}

export default function DataHubClient({ trials, uploadLog }: DataHubClientProps) {
  const [activeTab, setActiveTab] = useState('folder')

  return (
    <div className="grid grid-cols-3 gap-6">
      {/* Main area */}
      <div className="col-span-2">
        {/* Tab bar */}
        <div className="flex gap-1 mb-6">
          {tabs.map((tab) => {
            const Icon = tab.icon
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  'flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors',
                  activeTab === tab.key
                    ? 'bg-meta-blue text-white'
                    : 'bg-white text-brand-black/70 border border-brand-grey-2 hover:bg-brand-grey-3'
                )}
              >
                <Icon size={16} />
                {tab.label}
              </button>
            )
          })}
        </div>

        {/* Tab content */}
        <div className="card">
          {activeTab === 'folder' && <FolderUpload />}
          {activeTab === 'single' && <SingleFileUpload trials={trials} />}
          {activeTab === 'paste' && <PasteData trials={trials} />}
        </div>
      </div>

      {/* Right sidebar */}
      <div className="space-y-4">
        {/* File structure reference */}
        <div className="card">
          <p className="signpost-label mb-3">EXPECTED FILE STRUCTURE</p>
          <div className="text-xs font-mono text-brand-black/70 space-y-1">
            <p>Trial_YY#NN_Crop_Location/</p>
            <p className="pl-4">START HERE- Trial Summary.xlsx</p>
            <p className="pl-4">Soil Health Data.csv</p>
            <p className="pl-4">Soil Chemistry Data.csv</p>
            <p className="pl-4">Plot Data.csv</p>
            <p className="pl-4">Tissue Chemistry Data.xlsx</p>
            <p className="pl-4">Sample Metadata.csv</p>
            <p className="pl-4">Photos/</p>
          </div>
        </div>

        {/* Upload log */}
        <div className="card">
          <p className="signpost-label mb-3">UPLOAD LOG</p>
          <UploadLog entries={uploadLog} />
        </div>
      </div>
    </div>
  )
}
