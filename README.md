# ⚛️ Quarkify 

Quarkify is a minimalist, developer-centric web engine built on Electron. It reimagines browser architecture using a hierarchical "Atomic" structure to organize your digital life, focusing on context isolation and performance.

---

## The Architecture
Quarkify follows a proprietary hierarchy to keep your browsing organized and resource-efficient:

* **Molecules (Workspaces):** High-level isolated environments (e.g., Work, Personal, Research) with unique theme colors and independent state management.
* **Atoms (Groups):** Logical clusters of related tasks or projects within a single Molecule.
* **Quarks (Tabs):** The fundamental building blocks—individual Chromium web instances with dynamic title-tracking.

---

## Getting Started

### Prerequisites
* **Node.js** (v18.x or higher)
* **npm** (v9.x or higher)

### Installation
1.  **Clone the repository:**
    ```bash
    git clone [https://github.com/OualidRahmani/Quarkify.git](https://github.com/OualidRahmani/Quarkify.git)
    cd Quarkify
    ```
2.  **Install dependencies:**
    ```bash
    npm install
    ```

---

## Usage

### Development Mode
    Runs the browser with live-reloading for styles enabled and Chrome DevTools open by default:

```bash
npm start
```

### Building for Production
    To package the app into a standalone Linux AppImage (portable executable):

```bash
npm run build
```

The resulting binary will be generated in the dist/ directory.