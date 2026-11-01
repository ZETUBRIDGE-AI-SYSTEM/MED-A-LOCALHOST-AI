# Run MED-A on Windows with Ollama

This guide runs the website and API together on your laptop. Question generation goes to Ollama on that same laptop; no hosted AI API is used.

## Before you start: copy the updated project to your laptop

These changes are in your Replit project. In Replit, open the file tree, click its three-dot menu, and choose **Download as zip**. Extract the ZIP somewhere easy to find, such as your Documents folder. The commands below must be run inside that extracted project folder.

## 1. Install Node.js and pnpm

Install Node.js 24 or newer. Open PowerShell and check:

```powershell
node --version
```

If `pnpm` is not installed, install it once:

```powershell
npm install --global pnpm
```

Close and reopen PowerShell, then check:

```powershell
pnpm.cmd --version
```

Use `pnpm.cmd` in PowerShell. The `pnpm` PowerShell script can be blocked by Windows execution policy.

## 2. Open the project folder

In PowerShell, change into the folder where you saved this project. For example:

```powershell
cd "$HOME\Documents\med-a"
```

Use your actual folder name if it is different. Install the project packages:

```powershell
pnpm.cmd install
```

## 3. Check that Ollama has a model

Open the Ollama app from the Windows Start menu. In PowerShell, list its installed models:

```powershell
ollama list
```

If the list is empty, download a model once:

```powershell
ollama pull qwen2.5:7b
```

The download needs internet the first time. After the model is downloaded, Ollama can generate questions locally. If you already have a model, MED-A automatically uses the first model Ollama reports.

### For faster question and answer generation

A smaller model usually responds faster and uses less memory. For a quicker option, download Qwen 2.5 3B:

```powershell
ollama pull qwen2.5:3b
```

It can be less detailed or precise than a larger model, so review important medical information. Set `OLLAMA_MODEL` to the exact model name from `ollama list` to make sure MED-A uses it:

```powershell
$env:OLLAMA_MODEL = "qwen2.5:3b"
pnpm.cmd run start:local
```

Keep Ollama open while studying so its loaded model stays ready between questions.

MED-A can run up to three Ollama requests at once by default, so two requested answers can stream while the next question is generated. It can hold up to 500 additional requests in a waiting queue, with a two-minute queue timeout. Waiting requests are not simultaneous generations and a single laptop cannot guarantee instant responses for 500 people.

To let Ollama actually run three generations in parallel, first exit Ollama from the system tray. In one PowerShell window, start Ollama with:

```powershell
$env:OLLAMA_NUM_PARALLEL = "3"
ollama serve
```

Keep that window open. In a second PowerShell window, go to the project folder and start MED-A:

```powershell
$env:OLLAMA_MAX_CONCURRENT_REQUESTS = "3"
$env:OLLAMA_MAX_QUEUED_REQUESTS = "500"
$env:OLLAMA_QUEUE_TIMEOUT_MS = "120000"
pnpm.cmd run start:local
```

Parallel generation uses substantially more memory. If Ollama slows down or runs out of memory, lower both parallel settings to `2` or `1` and restart Ollama and MED-A. To serve 500 users with consistently low latency, use a hosted pool of GPU inference workers; the local queue only protects one laptop from being overwhelmed.

You can check that Ollama is answering on its local address:

```powershell
Invoke-RestMethod http://127.0.0.1:11434/api/tags
```

If that command cannot connect, start Ollama from the Start menu. If it is not already running in the background, open a second PowerShell window and run `ollama serve`.

## 4. Start MED-A

Return to the project folder in PowerShell and run:

```powershell
pnpm.cmd run start:local
```

This builds the website, then starts the app at `http://127.0.0.1:5000/`. Keep this window open while you use the app. To stop it, press **Ctrl+C**.

If you have more than one Ollama model and want to choose a specific one, set its exact name from `ollama list` before starting MED-A. For example:

```powershell
$env:OLLAMA_MODEL = "qwen2.5:7b"
pnpm.cmd run start:local
```

## 5. Subscription and internet

MED-A still checks your subscription with the ZetuBridge service before question generation. That check needs an internet connection and an active subscription. The AI question generation itself runs locally through Ollama. Model downloads also need internet, but only when downloading a model.

## If something goes wrong

- **“Ollama is not responding”** — Open the Ollama app, then retry the `Invoke-RestMethod` check above.
- **“No Ollama model is installed”** — Run `ollama pull qwen2.5:7b`, or install a model you prefer.
- **“Ollama does not have the model … installed”** — Run `ollama pull` followed by the model name shown in the message, or set `OLLAMA_MODEL` to the exact name from `ollama list`.
- **“Subscription service could not be reached”** — The local AI can work, but the app still needs internet to confirm your subscription.
- **Port 5000 is already in use** — Close the other program using that port, then run `pnpm.cmd run start:local` again.
