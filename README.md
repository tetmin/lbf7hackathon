# Pathway Visualizer

Interactive KEGG pathway visualization web app built with React and Cytoscape.js.

## Features

- 🧬 Interactive KEGG pathway visualization
- 🎨 Customizable data overlays with color coding
- 🔍 Hover tooltips and click-to-inspect panels
- 📱 Responsive design with Tailwind CSS
- 🔗 URL-based state management with TanStack Router
- ⚡ Fast development with Vite
- 🌐 Ready for Cloudflare Pages deployment

## Quick Start

### Development

1. **Install dependencies:**
   ```bash
   pnpm install
   ```

2. **Start development server:**
   ```bash
   pnpm dev
   ```

3. **Open your browser:**
   Navigate to `http://localhost:3000`

### Build and Deploy

1. **Build for production:**
   ```bash
   pnpm build
   ```

2. **Preview production build:**
   ```bash
   pnpm preview
   ```

3. **Deploy to Cloudflare Pages:**
   - Connect your GitHub repository to Cloudflare Pages
   - Set build command: `pnpm build`
   - Set build output directory: `dist`
   - Auto-deployment will trigger on git push

## Usage

### Basic Pathway Visualization

The app loads with the mTOR signaling pathway (`hsa04150`) by default. You can:

- **Change pathways:** Use the dropdown or enter a KEGG pathway ID
- **Toggle display options:** Show/hide node labels and KEGG background image
- **Interact with nodes:** Hover for tooltips, click for detailed panel
- **Navigate:** Pan and zoom with mouse/touch

### URL Parameters

The app supports URL parameters for sharing specific views:

```
/?pathway=hsa04150&showLabels=true&useBackground=false
```

- `pathway`: KEGG pathway ID (e.g., `hsa04150`)
- `showLabels`: Show node labels (`true`/`false`)
- `useBackground`: Show KEGG background image (`true`/`false`)

### Adding Data Overlays

To overlay your experimental data on pathway edges, modify the `sampleOverlay` object in `src/routes/index.jsx`:

```javascript
const overlay = {
  "78|79": -0.8,    // Edge from node 78 to 79, inhibition
  "81|82": 0.9,     // Edge from node 81 to 82, activation
  // Add your data here...
}
```

Values should be between -1 (red, inhibition) and +1 (blue, activation).

## CORS Proxy (if needed)

If you encounter CORS issues with the KEGG API, use the included proxy server:

1. **Install proxy dependencies:**
   ```bash
   cp proxy-package.json package.json
   pnpm install
   ```

2. **Start proxy server:**
   ```bash
   node proxy-server.js
   ```

3. **Update API URLs in KeggPathwayViewer.jsx:**
   ```javascript
   const KEGG_KGML = (id) => `http://localhost:3001/api/kegg/${id}/kgml`;
   const KEGG_PNG = (id) => `http://localhost:3001/api/kegg/${id}/image`;
   ```

## Project Structure

```
src/
├── components/
│   └── KeggPathwayViewer.jsx    # Main pathway visualization component
├── routes/
│   ├── __root.jsx               # Root layout
│   └── index.jsx                # Main page with controls
├── index.css                    # Global styles + Tailwind
├── main.jsx                     # App entry point
└── routeTree.gen.js            # TanStack Router configuration
```

## Technology Stack

- **Frontend:** React 19, Vite
- **Routing:** TanStack Router
- **State Management:** TanStack Query
- **Styling:** Tailwind CSS
- **Visualization:** Cytoscape.js with Popper.js
- **Package Manager:** pnpm
- **Linting/Formatting:** Biome
- **Deployment:** Cloudflare Pages

## Popular KEGG Pathways

- `hsa04150` - mTOR signaling pathway
- `hsa04010` - MAPK signaling pathway  
- `hsa04110` - Cell cycle
- `hsa04210` - Apoptosis
- `hsa04151` - PI3K-Akt signaling pathway
- `hsa04068` - FoxO signaling pathway

## License

MIT License - feel free to use this for your research and projects!

## Contributing

This is a hackathon project, but contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## Troubleshooting

### CORS Issues
Use the included proxy server (see instructions above).

### Build Issues
Ensure you're using Node.js 18+ and pnpm.

### Performance Issues
For large pathways, consider:
- Disabling KEGG background images
- Using data filtering to show only significant edges
- Reducing tooltip complexity

---

Built for the LBF7 Hackathon 🚀

