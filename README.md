# princesharma-tools

Free calculators for Indian e-commerce sellers and performance marketers, live at **[tools.princesharma.in](https://tools.princesharma.in/)**.

Built by [Prince Sharma](https://princesharma.in/), AI-powered performance marketer.

## Tools

| Tool | Status | Link |
|---|---|---|
| Amazon vs Flipkart vs Meesho profit calculator | Live | [tools.princesharma.in/profit-calculator](https://tools.princesharma.in/profit-calculator/) |
| COD & RTO loss calculator | Planned | |
| Sale discount planner | Planned | |
| Break-even ACoS & bid calculator | Planned | |
| Search term report analyser | Planned | |

## Profit calculator

Enter a product once and see your real profit on each marketplace after every fee.

- **Two modes:** *Check my profit* (from a selling price) and *Find my price* (from a target margin).
- **Amazon vs Flipkart** side by side with a winner badge, plus a separate **Meesho** mode.
- **Fee engine:** commission by category and price, closing/fixed fees by price band, weight-slab shipping by zone, volumetric weight, collection fees, FBA/FBF pick & pack.
- **GST handled properly:** output GST removed from the price; GST on fees and ads as input credit for registered sellers; TCS/TDS shown as cash held.
- **Ads and returns:** ad spend %, returns & RTO %, and damaged/lost returns on Meesho.
- **Outputs:** profit per unit and per month, margin health, break-even price, break-even ACoS/ROI, a full line-by-line calculation and a "where your money goes" breakdown.
- **Smart tips:** volumetric weight and slab savings, the ₹1,000 commission line, ACoS limits, return-rate impact, GST registration.
- **Fee structure** with Official / Public / Estimate tags, and **Edit fees** to match your own rate card (saved in the browser).
- **Save products, share link, export to CSV and print to PDF.** Everything runs in the browser; nothing is sent to a server.

### Files

```
profit-calculator/
  index.html   page markup and SEO
  styles.css   design (shared by the tools hub)
  fees.js      default fees with sources and the "verified" date
  calc.js      pure profit engine (works in the browser and in Node)
  app.js       UI: rendering, tips, fee tables, save/share/export
index.html     tools hub
```

### Updating fees

Edit `profit-calculator/fees.js`, update `VERIFIED`, and adjust the `source` tags. Platforms change fees often, and some values (Flipkart fixed fees and shipping slabs, Meesho shipping) vary by seller account, so they are marked as estimates.

### Run locally

No build step. Open `index.html`, or serve the folder:

```
python3 -m http.server 8000
```

Quick engine check in Node:

```
node -e "global.window={};require('./profit-calculator/fees.js');const C=require('./profit-calculator/calc.js');console.log(C.compute('amazon',999,{category:'sports',gst:18,cost:350,weight:0.6,zone:'national',ads:10,returns:8},window.PS_FEES).profit)"
```

## Disclaimer

Results are estimates. Marketplace fees vary by seller tier, category and programme and change often. Always confirm fees in Seller Central, Flipkart Seller Hub or the Meesho supplier panel before making pricing decisions.

## License

MIT
