# Windows setup — run the app locally

For students on Windows 10 or Windows 11.

---

## 1. Install the prerequisites (one-time)

| # | Tool | Install from | Notes |
|---|---|---|---|
| 1 | **Python 3.11.9** | <https://www.python.org/downloads/release/python-3119/> → "Windows installer (64-bit)" | **Tick "Add python.exe to PATH"** in the installer |
| 2 | **Node.js 20 LTS** | <https://nodejs.org/> | Default options. Installs `npm` too. |
| 3 | **Git for Windows** | <https://git-scm.com/download/win> | Default options |
| 4 | **Build Tools for Visual Studio 2022** | <https://visualstudio.microsoft.com/downloads/#build-tools-for-visual-studio-2022> | During install tick **"Desktop development with C++"** workload — needed to compile `pmdarima` & `prophet` |

That's it. (No need for `libomp` on Windows — LightGBM bundles its own OpenMP.)

---

## 2. Verify everything installed

Open **PowerShell** and run:

```powershell
python --version          # MUST say Python 3.11.x
node --version            # v20.x
npm --version             # 10.x
git --version             # any
```

If `python --version` shows 3.12 or 3.13, you have multiple Pythons installed. Use:

```powershell
py -3.11 --version        # should say Python 3.11.9
```

…and replace `python` with `py -3.11` in the commands below.

---

## 3. Clone the project

```powershell
cd C:\Users\<you>\Desktop
git clone https://github.com/fahalsalam/DEMAND_FORECAST.git
cd DEMAND_FORECAST\files
```

---

## 4. Backend — one-time setup

```powershell
cd backend
py -3.11 -m venv .venv
.\.venv\Scripts\pip install --upgrade pip
.\.venv\Scripts\pip install -r requirements.txt
```

> This takes ~5–10 minutes. It compiles `pmdarima` and `prophet` from source — that's why the C++ Build Tools were required.

Now compile Prophet's Stan model (one-time, ~2 min):

```powershell
.\.venv\Scripts\python -c "import cmdstanpy; cmdstanpy.install_cmdstan(progress=False)"
```

Seed the database with 30 demo SKUs + 2 years of sales:

```powershell
.\.venv\Scripts\python seed.py
```

Expected output:
```
Seed complete:
          products: 30
        sales_rows: 19798
    inventory_rows: 30
   cold_start_skus: 3
```

---

## 5. Frontend — one-time setup

```powershell
cd ..\frontend
npm install
```

(~1–2 min.)

---

## 6. Run the app (every time)

You need **two PowerShell windows open at once**.

### Window 1 — Backend
```powershell
cd C:\Users\<you>\Desktop\DEMAND_FORCAST\files\backend
.\.venv\Scripts\uvicorn app.main:app --reload --port 8000
```

You should see:
```
Uvicorn running on http://127.0.0.1:8000
```
Leave this window open.

### Window 2 — Frontend
```powershell
cd C:\Users\<you>\Desktop\DEMAND_FORCAST\files\frontend
npm run dev
```

You should see:
```
Local:   http://localhost:5173/
```

### Open the app
In Chrome / Edge / Firefox:

**<http://localhost:5173>**

Sign in:
- **Email:** `admin@retail.local`
- **Password:** `demo1234`

---

## 7. Stop the app

In each PowerShell window press **`Ctrl + C`**, then close the window.

---

## 💻 Machine spec recommendations

| Resource | Minimum | Recommended |
|---|---|---|
| Free disk space | 2 GB | 3 GB |
| RAM | 4 GB | 8 GB+ |
| OS | Windows 10 (1909+) or Windows 11 | Windows 11 |
| Internet | Needed first time only | — |

---

## 🛠️ Common Windows-specific errors

| Error | Fix |
|---|---|
| `'python' is not recognized` | You forgot to tick "Add to PATH" during install. Uninstall, re-install, **tick the box this time** |
| `error: Microsoft Visual C++ 14.0 or greater is required` | Install Visual Studio Build Tools (item #4 above) with "Desktop development with C++" |
| `ERROR: Failed building wheel for pmdarima` | You're using Python 3.12 or 3.13. Use `py -3.11 -m venv .venv` |
| `AttributeError: 'Prophet' object has no attribute 'stan_backend'` | `pip install cmdstanpy==1.2.5` — already pinned in `requirements.txt`, just re-run the install command |
| Browser shows red **"API · offline"** chip | Backend window isn't running. Start it (Window 1) |
| `Port 5173 already in use` | Close any other Vite project, or run `npx kill-port 5173` |
| Login button does nothing | Hard refresh: **`Ctrl + Shift + R`** |
| `running scripts is disabled on this system` | Run PowerShell as Administrator once: `Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser` |

---

## 📋 Print-friendly one-pager

```
INSTALL (once):
 1. Python 3.11.9        →  python.org   (TICK "Add to PATH")
 2. Node.js 20 LTS       →  nodejs.org
 3. Git for Windows      →  git-scm.com
 4. VS Build Tools 2022  →  visualstudio.microsoft.com (Desktop dev with C++)

VERIFY:
   python --version       →  Python 3.11.x
   node --version         →  v20.x
   npm --version          →  10.x

CLONE + SETUP (once):
   git clone https://github.com/fahalsalam/DEMAND_FORECAST.git
   cd DEMAND_FORECAST\files\backend
   py -3.11 -m venv .venv
   .\.venv\Scripts\pip install --upgrade pip
   .\.venv\Scripts\pip install -r requirements.txt
   .\.venv\Scripts\python -c "import cmdstanpy; cmdstanpy.install_cmdstan(progress=False)"
   .\.venv\Scripts\python seed.py
   cd ..\frontend
   npm install

RUN (every time — two PowerShell windows):
   Window 1:  cd backend  &&  .\.venv\Scripts\uvicorn app.main:app --reload --port 8000
   Window 2:  cd frontend &&  npm run dev

OPEN:    http://localhost:5173
LOGIN:   admin@retail.local  /  demo1234
```
