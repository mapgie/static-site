<div align="center">

## 8008: [Visit](https://8008.netlify.app/) ##
Minimal static site.  

[![Netlify Status](https://api.netlify.com/api/v1/badges/dc9c44f7-3b09-440b-82e3-88a1803bc2ab/deploy-status)](https://app.netlify.com/sites/8008/deploys)

</div>

## Documentation

- [`docs/ant-farm.md`](docs/ant-farm.md) – How the Ant Farm simulation works: colonies, food, hunger, happiness, poison, queens, and controls.

## Structure

- `index.html` – Home page  
- `ant-farm.html` – Ant Farm simulation ([mechanics](docs/ant-farm.md))  
- `memory-maze.html` – Memory Maze demo  
- `art.html` – Procedural art generator  
- `rps.html` – Rock–Paper–Scissors game  
- `global.css` – Global styles  
- `ant-farm.css` – Ant Farm specific styles  
- `js/` – JavaScript modules  
- `build-header.sh` – Generate `header-snippet.html`  
- `check-and-inject.sh` – Inject header snippet into each HTML  
- `.github/workflows/build-header.yaml` – CI task for header injection  

## Usage

1. Install Netlify CLI (optional).  
2. Run `./build-header.sh`.  
3. Run `./check-and-inject.sh`.  
4. Deploy via Netlify or any static host.

## CI

On push to `main`, GitHub Actions regenerates and reinjects header.  

## File Structure
``` sh
├── Human-Test.html
├── LICENSE
├── README.md
├── ant-farm.css
├── ant-farm.html
├── art.html
├── check-and-inject.sh
├── global.css
├── header-snippet.html
├── header.html
├── index.html
├── memory-maze.html
├── rps.html
├── .github
│   └── workflows
│       └── build-header.yaml
├── .header_checksum
├── ant-control-panel.html
├── build-header.sh
├── js                    # Ant Farm, split by concern (loaded in this order)
│   ├── ant-constants.js  # config + food specs
│   ├── ant-state.js      # mutable runtime state
│   ├── ant-utils.js      # math, colony/canvas helpers, spatial grid
│   ├── ant-entities.js   # ants, food & nest entities
│   ├── ant-ui.js         # bootstrap, controls, tuning, maintenance view
│   ├── ant-simulation.js # main loop & per-tick behaviour
│   ├── ant-render.js     # canvas drawing, bars & stats
│   └── ant-storage.js    # localStorage persistence
└── .gitignore
```