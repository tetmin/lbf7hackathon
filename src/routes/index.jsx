import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import KeggPathwayViewer from '../components/KeggPathwayViewer'

export const Route = createFileRoute('/')({
  component: Index,
  validateSearch: (search) => {
    return {
      pathway: search.pathway || 'hsa04150',
      showLabels: search.showLabels !== 'false'
    }
  }
})

function Index() {
  const { pathway, showLabels } = Route.useSearch()
  const navigate = Route.useNavigate()
  
  const [pathwayInput, setPathwayInput] = useState(pathway)

  // Sample edge overlay data - you can replace this with your actual data
  const sampleOverlay = {
    "78|79": -0.8,
    "81|82": 0.9,
    "83|84": 0.5,
    "85|86": -0.3,
  }

  const handlePathwayChange = (newPathway) => {
    navigate({
      search: (prev) => ({ ...prev, pathway: newPathway })
    })
  }

  const handleToggle = (key, value) => {
    navigate({
      search: (prev) => ({ ...prev, [key]: value.toString() })
    })
  }

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="bg-white rounded-lg shadow-sm border p-6">
        <h2 className="text-lg font-semibold mb-4">Pathway Controls</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              KEGG Pathway ID
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={pathwayInput}
                onChange={(e) => setPathwayInput(e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., hsa04150"
              />
              <button
                onClick={() => handlePathwayChange(pathwayInput)}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                Load
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Display Options
            </label>
            <div className="space-y-2">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={showLabels}
                  onChange={(e) => handleToggle('showLabels', e.target.checked)}
                  className="mr-2"
                />
                <span className="text-sm">Show node labels</span>
              </label>
              <div className="text-xs text-gray-500 mt-2">
                Pathway is rendered from KGML data with exact positioning and colors
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Popular Pathways
            </label>
            <select
              value={pathway}
              onChange={(e) => handlePathwayChange(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="hsa04150">mTOR signaling (hsa04150)</option>
              <option value="hsa04010">MAPK signaling (hsa04010)</option>
              <option value="hsa04110">Cell cycle (hsa04110)</option>
              <option value="hsa04210">Apoptosis (hsa04210)</option>
              <option value="hsa04151">PI3K-Akt signaling (hsa04151)</option>
              <option value="hsa04068">FoxO signaling (hsa04068)</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Legend
            </label>
            <div className="text-xs space-y-1">
              <div className="flex items-center gap-2">
                <div className="w-4 h-1 bg-red-500"></div>
                <span>Inhibition (-1.0)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-1 bg-gray-400"></div>
                <span>No change (0.0)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-1 bg-blue-500"></div>
                <span>Activation (+1.0)</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Pathway Viewer */}
      <div className="bg-white rounded-lg shadow-sm border p-6">
        <KeggPathwayViewer
          pathwayId={pathway}
          edgeOverlay={sampleOverlay}
          showNodeLabels={showLabels}
        />
      </div>

      {/* Info Panel */}
      <div className="bg-white rounded-lg shadow-sm border p-6">
        <h3 className="text-lg font-semibold mb-3">About This Visualization</h3>
        <div className="prose prose-sm max-w-none text-gray-600">
          <p>
            This interactive pathway viewer renders KEGG pathways from KGML data with exact positioning,
            colors, and shapes as defined in the original pathway specification. Gene nodes appear in 
            light green, compounds as white circles, and pathway maps as white rounded rectangles.
          </p>
          <p>
            <strong>API-Driven Gene Naming:</strong> The viewer fetches standardized gene names from the 
            KEGG REST API in real-time, ensuring consistent and accurate gene symbols across all pathways. 
            Initial rendering uses fallback names for speed, then updates with official KEGG gene symbols.
          </p>
          <p>
            Hover over nodes for details, click to open the side panel. Edge colors and widths can 
            represent your experimental data values (red = inhibition, blue = activation). Arrows 
            indicate activation, T-shaped ends show inhibition, and plain lines represent binding.
          </p>
          <p>
            The viewer fetches pathway data directly from KEGG REST API via a local proxy server 
            to handle CORS restrictions.
          </p>
        </div>
      </div>
    </div>
  )
}

