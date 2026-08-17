/* ---------------------------------------------------------------------------
   payment-test.html — payment method sandbox.

   Everything here is simulated in the browser. There is no processor SDK, no
   network call, no key and no address, so the page cannot move money however
   it is configured. Wiring a live rail in is a deliberate, separate step.
--------------------------------------------------------------------------- */
(function () {
  "use strict";

  var $ = function (id) {
    return document.getElementById(id);
  };

  var amountEl = $("amount");
  var referenceEl = $("reference");
  var outcomeEl = $("outcome");
  var latencyEl = $("latency");
  var chainEl = $("chain");
  var volatilityEl = $("volatility");
  var confirmationsEl = $("confirmations");
  var runBtn = $("runBtn");
  var btnLabel = runBtn.querySelector(".btn-label");
  var resultEl = $("result");
  var logEl = $("log");

  $("footerYear").textContent = String(new Date().getFullYear());

  /* ---------- per-rail behaviour ---------- */

  var RAILS = {
    card: {
      label: "Card",
      settles: "instantly on authorisation",
      reversible: true,
      steps: [
        ["info", "Redirecting customer to hosted checkout"],
        ["info", "Customer enters card on processor domain (never on ours)"],
        ["info", "Processor authorises and captures"],
        ["info", "Webhook received: payment_intent.succeeded"],
      ],
      onSuccess: "Refund is a single API call; customer also holds chargeback rights.",
      pending: "3-D Secure challenge outstanding — await the webhook, do not dispatch yet.",
      failMsg: "Card declined by issuer.",
    },
    cashapp: {
      label: "Cash App",
      settles: "instantly",
      reversible: false,
      steps: [
        ["info", "Displaying cashtag and amount to customer"],
        ["warn", "Customer sends manually — no automatic reconciliation"],
        ["warn", "Staff must confirm receipt in the Cash App ledger by hand"],
      ],
      onSuccess: "No automatic reconciliation: match the payment to the booking manually.",
      pending: "Nothing to poll — someone has to eyeball the Cash App ledger.",
      failMsg: "No matching payment found against this reference.",
    },
    bank: {
      label: "Bank transfer",
      settles: "ACH in 1-3 business days, wire same day",
      reversible: false,
      steps: [
        ["info", "Displaying account details to customer"],
        ["warn", "Customer initiates push transfer from their bank"],
        ["warn", "Funds unconfirmed until they land — reconcile against the statement"],
      ],
      onSuccess: "Confirm settlement on the statement before dispatching a vehicle.",
      pending: "ACH in flight. Dispatching now means carrying the risk yourself.",
      failMsg: "No matching deposit found for this reference.",
    },
    crypto: {
      label: "Crypto",
      settles: "on network confirmation",
      reversible: false,
      steps: [
        ["info", "Displaying receiving address and amount"],
        ["warn", "Amount quoted in fiat — the crypto figure drifts with the rate"],
        ["warn", "Awaiting network confirmations"],
        ["err", "Transfer is irreversible once confirmed — no dispute path exists"],
      ],
      onSuccess: "Refunding means a fresh outbound send, minus fees, at the then-current rate.",
      pending: "Below the required confirmation count — treat as unpaid until it clears.",
      failMsg: "Underpaid or wrong network — funds may be unrecoverable.",
    },
  };

  var CHAINS = {
    BTC: { confirmations: "3 confirmations (~30 min)", volatility: "High" },
    ETH: { confirmations: "12 confirmations (~3 min)", volatility: "High" },
    "USDC-ETH": { confirmations: "12 confirmations (~3 min)", volatility: "Low (stablecoin)" },
    "USDT-TRX": { confirmations: "19 confirmations (~1 min)", volatility: "Low (stablecoin)" },
  };

  function currentMethod() {
    return document.querySelector('input[name="method"]:checked').value;
  }

  /* ---------- panel switching ---------- */

  Array.prototype.forEach.call(document.querySelectorAll('input[name="method"]'), function (radio) {
    radio.addEventListener("change", function () {
      var method = currentMethod();
      Array.prototype.forEach.call(document.querySelectorAll(".panel"), function (p) {
        p.classList.toggle("is-active", p.getAttribute("data-panel") === method);
      });
      log("info", "Method switched to " + RAILS[method].label);
    });
  });

  function syncChain() {
    var c = CHAINS[chainEl.value];
    confirmationsEl.textContent = c.confirmations;
    volatilityEl.value = c.volatility;
  }
  chainEl.addEventListener("change", syncChain);
  syncChain();

  /* ---------- log ---------- */

  function log(kind, message) {
    var line = document.createElement("span");
    var time = document.createElement("span");
    time.className = "t";
    time.textContent = new Date().toLocaleTimeString(undefined, { hour12: false }) + "  ";
    var body = document.createElement("span");
    body.className = kind;
    body.textContent = message;
    line.appendChild(time);
    line.appendChild(body);
    line.appendChild(document.createTextNode("\n"));
    logEl.appendChild(line);
    logEl.scrollTop = logEl.scrollHeight;
  }

  $("clearLog").addEventListener("click", function () {
    logEl.textContent = "";
  });

  /* ---------- result rendering ---------- */

  function money(n) {
    return "$" + Number(n).toFixed(2);
  }

  function fakeTxnId(method) {
    var prefix = { card: "pi_test_", cashapp: "cash_test_", bank: "ach_test_", crypto: "0xtest" }[
      method
    ];
    var chars = "abcdef0123456789";
    var out = "";
    for (var i = 0; i < 16; i++) out += chars[Math.floor(Math.random() * chars.length)];
    return prefix + out;
  }

  function renderResult(method, outcome) {
    var rail = RAILS[method];
    var amount = money(amountEl.value);
    var ref = referenceEl.value || "(no reference)";
    var cls, badge, title, note;

    if (outcome === "success") {
      cls = "result--success";
      badge = "✓";
      title = amount + " received via " + rail.label;
      note = rail.onSuccess;
    } else if (outcome === "pending") {
      cls = "result--pending";
      badge = "…";
      title = amount + " pending via " + rail.label;
      note = rail.pending;
    } else if (outcome === "cancelled") {
      cls = "result--failed";
      badge = "✕";
      title = "Customer abandoned " + rail.label + " checkout";
      note = "No funds moved. The booking stays unconfirmed.";
    } else {
      cls = "result--failed";
      badge = "✕";
      title = rail.label + " payment failed";
      note = rail.failMsg;
    }

    resultEl.className = "result is-visible " + cls;
    resultEl.textContent = "";

    var head = document.createElement("div");
    head.className = "result__head";
    var b = document.createElement("span");
    b.className = "result__badge";
    b.setAttribute("aria-hidden", "true");
    b.textContent = badge;
    var t = document.createElement("span");
    t.textContent = title;
    head.appendChild(b);
    head.appendChild(t);
    resultEl.appendChild(head);

    var p = document.createElement("p");
    p.style.margin = "0";
    p.style.fontSize = "0.87rem";
    p.textContent = note;
    resultEl.appendChild(p);

    var rows = [
      ["Reference", ref],
      ["Amount", amount],
      ["Method", rail.label],
      [
        "Reversible",
        rail.reversible ? "yes — customer can dispute" : "no — refund is discretionary",
      ],
      ["Settles", rail.settles],
    ];
    if (outcome === "success" || outcome === "pending") {
      rows.push(["Txn id (fake)", fakeTxnId(method)]);
    }
    if (method === "crypto") {
      rows.push(["Network", chainEl.value]);
    }

    var dl = document.createElement("dl");
    rows.forEach(function (r) {
      var dt = document.createElement("dt");
      var dd = document.createElement("dd");
      dt.textContent = r[0];
      dd.textContent = r[1];
      dl.appendChild(dt);
      dl.appendChild(dd);
    });
    resultEl.appendChild(dl);
  }

  /* ---------- run ---------- */

  runBtn.addEventListener("click", function () {
    var method = currentMethod();
    var outcome = outcomeEl.value;
    var rail = RAILS[method];
    var latency = Math.max(0, Math.min(10000, Number(latencyEl.value) || 0));

    if (!(Number(amountEl.value) > 0)) {
      log("err", "Amount must be greater than zero.");
      amountEl.focus();
      return;
    }

    runBtn.disabled = true;
    runBtn.classList.add("is-busy");
    btnLabel.textContent = "Simulating…";
    resultEl.className = "result";

    log("info", "--- " + rail.label + " / " + outcome + " / " + money(amountEl.value) + " ---");
    rail.steps.forEach(function (s) {
      log(s[0], s[1]);
    });

    window.setTimeout(function () {
      if (outcome === "success") {
        log(
          "ok",
          "Payment confirmed. Booking " + (referenceEl.value || "?") + " may be dispatched.",
        );
        if (!rail.reversible) {
          log("warn", "Refund on this rail has no enforcement path for the customer.");
        }
      } else if (outcome === "pending") {
        log("warn", "Still pending — do not dispatch against unsettled funds.");
      } else if (outcome === "cancelled") {
        log("warn", "Customer cancelled. No funds moved.");
      } else {
        log("err", rail.failMsg);
      }

      renderResult(method, outcome);
      runBtn.disabled = false;
      runBtn.classList.remove("is-busy");
      btnLabel.textContent = "Run simulated payment";
    }, latency);
  });
})();
