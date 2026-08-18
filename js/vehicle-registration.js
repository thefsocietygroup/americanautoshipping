/* ---------------------------------------------------------------------------
   Test drive registration form.

   Submits to Web3Forms over their JSON API (rather than a plain form POST) so
   we can validate inline, show a busy state, surface real errors, and hand the
   booking reference to the inspection-fee page.

   Deliberately NOT handled here: card details. Payment is a hand-off to a
   payment processor on the next page — see js/inspection-fee.js.
--------------------------------------------------------------------------- */
(function () {
  "use strict";

  var ENDPOINT = "https://api.web3forms.com/submit";
  var NEXT_PAGE = "./inspection-fee.html";
  var STORAGE_KEY = "aas.testdrive.registration";

  var form = document.getElementById("registrationForm");
  var submitBtn = document.getElementById("submitBtn");
  var btnLabel = submitBtn.querySelector(".btn-label");
  var formError = document.getElementById("formError");

  var STATES = [
    ["AL", "Alabama"],
    ["AK", "Alaska"],
    ["AZ", "Arizona"],
    ["AR", "Arkansas"],
    ["CA", "California"],
    ["CO", "Colorado"],
    ["CT", "Connecticut"],
    ["DE", "Delaware"],
    ["DC", "District of Columbia"],
    ["FL", "Florida"],
    ["GA", "Georgia"],
    ["HI", "Hawaii"],
    ["ID", "Idaho"],
    ["IL", "Illinois"],
    ["IN", "Indiana"],
    ["IA", "Iowa"],
    ["KS", "Kansas"],
    ["KY", "Kentucky"],
    ["LA", "Louisiana"],
    ["ME", "Maine"],
    ["MD", "Maryland"],
    ["MA", "Massachusetts"],
    ["MI", "Michigan"],
    ["MN", "Minnesota"],
    ["MS", "Mississippi"],
    ["MO", "Missouri"],
    ["MT", "Montana"],
    ["NE", "Nebraska"],
    ["NV", "Nevada"],
    ["NH", "New Hampshire"],
    ["NJ", "New Jersey"],
    ["NM", "New Mexico"],
    ["NY", "New York"],
    ["NC", "North Carolina"],
    ["ND", "North Dakota"],
    ["OH", "Ohio"],
    ["OK", "Oklahoma"],
    ["OR", "Oregon"],
    ["PA", "Pennsylvania"],
    ["RI", "Rhode Island"],
    ["SC", "South Carolina"],
    ["SD", "South Dakota"],
    ["TN", "Tennessee"],
    ["TX", "Texas"],
    ["UT", "Utah"],
    ["VT", "Vermont"],
    ["VA", "Virginia"],
    ["WA", "Washington"],
    ["WV", "West Virginia"],
    ["WI", "Wisconsin"],
    ["WY", "Wyoming"],
  ];

  /* ---------- helpers ---------- */

  var $ = function (id) {
    return document.getElementById(id);
  };

  function fillStates(select) {
    var frag = document.createDocumentFragment();
    STATES.forEach(function (s) {
      var o = document.createElement("option");
      o.value = s[0];
      o.textContent = s[1];
      frag.appendChild(o);
    });
    select.appendChild(frag);
  }

  function isoToday() {
    var d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); // local date, not UTC
    return d.toISOString().slice(0, 10);
  }

  function makeReference() {
    var chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no look-alike glyphs
    var out = "";
    var i;
    if (window.crypto && window.crypto.getRandomValues) {
      var rnd = new Uint8Array(6);
      window.crypto.getRandomValues(rnd);
      for (i = 0; i < 6; i++) out += chars[rnd[i] % chars.length];
    } else {
      for (i = 0; i < 6; i++) out += chars[Math.floor(Math.random() * chars.length)];
    }
    return "AAS-TD-" + out;
  }

  /* ---------- page setup ---------- */

  fillStates($("state"));
  fillStates($("dlState"));

  var today = isoToday();
  $("preferredDate").min = today;
  $("altDate").min = today;
  $("dlExpiry").min = today;
  $("reference").value = makeReference();

  var footerYear = $("footerYear");
  if (footerYear) footerYear.textContent = String(new Date().getFullYear());

  /* ---------- validation ---------- */

  var VALIDATORS = {
    fullName: function (v) {
      if (!v.trim()) return "Please enter your full name.";
      if (v.trim().length < 2) return "That name looks too short.";
      return "";
    },
    phone: function (v) {
      var digits = v.replace(/\D/g, "");
      if (!digits) return "Please enter a phone number.";
      if (digits.length < 10) return "Enter a 10-digit phone number.";
      return "";
    },
    email: function (v) {
      if (!v.trim()) return "Please enter your email address.";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim())) return "That email address isn't valid.";
      return "";
    },
    address: function (v) {
      return v.trim() ? "" : "Please enter the delivery street address.";
    },
    city: function (v) {
      return v.trim() ? "" : "Please enter the city.";
    },
    state: function (v) {
      return v ? "" : "Please select a state.";
    },
    zip: function (v) {
      if (!v.trim()) return "Please enter a ZIP code.";
      if (!/^\d{5}(-\d{4})?$/.test(v.trim())) return "Enter a 5-digit ZIP (or ZIP+4).";
      return "";
    },
    vin: function (v) {
      var s = v.trim();
      if (!s) return "Please enter the vehicle's VIN.";
      if (s.length !== 17) return "A VIN is exactly 17 characters — you have " + s.length + ".";
      if (/[IOQ]/.test(s)) return "A VIN never contains the letters I, O or Q.";
      return "";
    },
    preferredDate: function (v) {
      if (!v) return "Please choose a preferred date.";
      if (v < isoToday()) return "Please choose today or a future date.";
      return "";
    },
    preferredTime: function (v) {
      return v ? "" : "Please choose a time window.";
    },
    dlNumber: function (v) {
      if (!v.trim()) return "Please enter your driver's licence number.";
      if (v.trim().length < 4) return "That licence number looks too short.";
      return "";
    },
    dlState: function (v) {
      return v ? "" : "Please select the issuing state.";
    },
    dlExpiry: function (v) {
      if (!v) return "Please enter the licence expiry date.";
      if (v < isoToday()) return "That licence has expired — we can't dispatch against it.";
      return "";
    },
    insurer: function (v) {
      return v.trim() ? "" : "Please enter your insurance provider.";
    },
    policyNumber: function (v) {
      return v.trim() ? "" : "Please enter your policy number.";
    },
  };

  var CHECKBOXES = {
    confirmDocs: "Please confirm you'll present your licence and insurance.",
    agreeTerms: "You must accept the terms to continue.",
    agreeFee: "Please confirm you understand the $10 refundable fee.",
  };

  function showError(id, message) {
    var field = $(id);
    var slot = document.querySelector('[data-error-for="' + id + '"]');
    if (message) {
      field.setAttribute("aria-invalid", "true");
      if (slot) {
        slot.textContent = message;
        slot.classList.add("is-visible");
      }
    } else {
      field.removeAttribute("aria-invalid");
      if (slot) {
        slot.textContent = "";
        slot.classList.remove("is-visible");
      }
    }
    return !message;
  }

  function validateField(id) {
    return showError(id, VALIDATORS[id]($(id).value));
  }

  function validateAll() {
    var firstBad = null;
    var ok = true;

    Object.keys(VALIDATORS).forEach(function (id) {
      if (!validateField(id)) {
        ok = false;
        if (!firstBad) firstBad = id;
      }
    });

    Object.keys(CHECKBOXES).forEach(function (id) {
      var good = showError(id, $(id).checked ? "" : CHECKBOXES[id]);
      if (!good) {
        ok = false;
        if (!firstBad) firstBad = id;
      }
    });

    if (firstBad) $(firstBad).focus();
    return ok;
  }

  // Clear a field's error as soon as it becomes valid again.
  Object.keys(VALIDATORS).forEach(function (id) {
    var el = $(id);
    el.addEventListener("blur", function () {
      validateField(id);
    });
    el.addEventListener("input", function () {
      if (el.getAttribute("aria-invalid") === "true") validateField(id);
    });
  });
  Object.keys(CHECKBOXES).forEach(function (id) {
    $(id).addEventListener("change", function () {
      showError(id, $(id).checked ? "" : CHECKBOXES[id]);
    });
  });
  /* ---------- VIN decode (NHTSA vPIC) ------------------------------------
     Free, public, no API key, CORS-open. Decodes the manufacturer's build
     record for a VIN pattern: make, model, year, trim, engine, plant.

     What it cannot tell us: mileage, colour, title status, accident history
     or current ownership — none of that lives in a VIN. Those need a paid
     history provider.

     The lookup is a convenience, never a gate: if vPIC is slow, down or
     doesn't recognise the vehicle, the booking still goes through.
  ---------------------------------------------------------------------- */

  var VPIC = "https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/";
  var VIN_TIMEOUT_MS = 12000; // observed cold-start responses around 8s

  var vinEl = $("vin");
  var vinResult = $("vinResult");
  var vinLookupBtn = $("vinLookup");
  var vehicleSummary = $("vehicleSummary");
  var vehicleDetails = $("vehicleDetails");

  var vinCache = {};
  var vinDebounce = null;
  var vinInFlight = null;
  var lastLookedUp = "";

  function clearVehicleFields() {
    vehicleSummary.value = "";
    vehicleDetails.value = "";
  }

  function renderVinIdle() {
    vinResult.hidden = true;
    vinResult.textContent = "";
    vinResult.className = "vin-result";
    clearVehicleFields();
  }

  function renderVinLoading() {
    vinResult.hidden = false;
    vinResult.className = "vin-result";
    vinResult.textContent = "";
    var row = document.createElement("div");
    row.className = "vin-result__status";
    var sp = document.createElement("span");
    sp.className = "vin-spinner";
    var tx = document.createElement("span");
    tx.textContent = "Looking up this VIN…";
    row.appendChild(sp);
    row.appendChild(tx);
    vinResult.appendChild(row);
  }

  function renderVinMessage(kind, text) {
    vinResult.hidden = false;
    vinResult.className = "vin-result vin-result--" + kind;
    vinResult.textContent = "";
    var p = document.createElement("p");
    p.className = "vin-result__note";
    p.style.margin = "0";
    p.textContent = text;
    vinResult.appendChild(p);
    clearVehicleFields();
  }

  // Build the "2003 Honda Accord" headline plus spec chips from a vPIC record.
  function renderVinFound(v, warning) {
    // vPIC shouts Make ("AUDI") but stores Model already correctly cased
    // ("SQ5", "Accord", "Model 3"), so only the make gets softened.
    var headline = [v.ModelYear, titleCase(v.Make), v.Model].filter(Boolean).join(" ");

    vinResult.hidden = false;
    vinResult.className = "vin-result " + (warning ? "vin-result--warn" : "vin-result--found");
    vinResult.textContent = "";

    var status = document.createElement("div");
    status.className = "vin-result__status";
    status.textContent = warning ? "⚠ Vehicle identified" : "✓ Vehicle identified";
    vinResult.appendChild(status);

    var h = document.createElement("p");
    h.className = "vin-result__vehicle";
    h.textContent = headline;
    vinResult.appendChild(h);

    if (v.Trim || v.Series) {
      var t = document.createElement("p");
      t.className = "vin-result__trim";
      t.textContent = [v.Trim, v.Series].filter(Boolean).join(" · ");
      vinResult.appendChild(t);
    }

    // Values sourced from vPIC get case-softened; engineText and Doors are
    // composed here already in the right shape, so they pass through as-is.
    var specs = [
      ["Body", titleCase(v.BodyClass)],
      ["Type", titleCase(v.VehicleType)],
      ["Engine", engineText(v)],
      ["Fuel", titleCase(v.FuelTypePrimary)],
      ["Drive", titleCase(v.DriveType)],
      ["Doors", v.Doors],
      ["Built", titleCase([v.PlantCity, v.PlantCountry].filter(Boolean).join(", "))],
    ].filter(function (s) {
      return s[1];
    });

    if (specs.length) {
      var ul = document.createElement("ul");
      ul.className = "chips";
      specs.forEach(function (s) {
        var li = document.createElement("li");
        var b = document.createElement("b");
        b.textContent = s[0] + " ";
        li.appendChild(b);
        li.appendChild(document.createTextNode(String(s[1])));
        ul.appendChild(li);
      });
      vinResult.appendChild(ul);
    }

    if (warning) {
      var w = document.createElement("p");
      w.className = "vin-result__note";
      w.textContent = warning;
      vinResult.appendChild(w);
    }

    // Carry the decode into the submission.
    vehicleSummary.value = headline;
    vehicleDetails.value = specs
      .map(function (s) {
        return s[0] + ": " + s[1];
      })
      .join(" | ");
  }

  function engineText(v) {
    var bits = [];
    if (v.DisplacementL) bits.push(Number(v.DisplacementL).toFixed(1) + "L");
    if (v.EngineCylinders) bits.push(v.EngineCylinders + "-cyl");
    if (v.EngineHP) bits.push(v.EngineHP + " hp");
    return bits.join(" ");
  }

  // Genuine acronyms that must stay upper-case. A "short and capitalised"
  // heuristic is not enough — it wrongly preserves CAR, SAN, VAN and so on.
  var ACRONYMS = {
    SUV: 1,
    MPV: 1,
    AWD: 1,
    FWD: 1,
    RWD: 1,
    ABS: 1,
    GVWR: 1,
    USA: 1,
    US: 1,
    UK: 1,
    EV: 1,
    BEV: 1,
    PHEV: 1,
    HEV: 1,
    FCEV: 1,
    CNG: 1,
    LPG: 1,
    LNG: 1,
    DSL: 1,
    BMW: 1,
    GMC: 1,
    MG: 1,
    KTM: 1,
    BYD: 1,
    AM: 1,
    PM: 1,
    VIN: 1,
    NA: 1,
  };

  // vPIC shouts most values in caps; soften them for display. Splitting on
  // alphanumerics means hyphens and slashes are handled piece by piece, so
  // "AWD/ALL-WHEEL DRIVE" becomes "AWD/All-Wheel Drive".
  function titleCase(s) {
    if (!s) return "";
    return String(s).replace(/[A-Za-z0-9']+/g, function (word) {
      var up = word.toUpperCase();
      if (ACRONYMS[up]) return up;
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    });
  }

  function lookupVin(vin) {
    if (vinCache[vin]) {
      applyVinResult(vin, vinCache[vin]);
      return;
    }

    if (vinInFlight) vinInFlight.abort();
    var controller = new AbortController();
    vinInFlight = controller;
    var timer = window.setTimeout(function () {
      controller.abort();
    }, VIN_TIMEOUT_MS);

    renderVinLoading();
    lastLookedUp = vin;

    fetch(VPIC + encodeURIComponent(vin) + "?format=json", { signal: controller.signal })
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (data) {
        window.clearTimeout(timer);
        vinInFlight = null;
        var v = data && data.Results && data.Results[0];
        if (!v) throw new Error("Unexpected response");
        vinCache[vin] = v;
        if (vinEl.value.trim().toUpperCase() === vin) applyVinResult(vin, v);
      })
      .catch(function (err) {
        window.clearTimeout(timer);
        vinInFlight = null;
        if (err && err.name === "AbortError") return; // superseded or timed out
        if (vinEl.value.trim().toUpperCase() !== vin) return;
        renderVinMessage(
          "error",
          "We couldn't reach the vehicle database just now. That's fine — your VIN is " +
            "recorded and we'll confirm the vehicle when we call to arrange the appointment.",
        );
      });
  }

  function applyVinResult(vin, v) {
    if (!v.Make) {
      renderVinMessage(
        "error",
        "We couldn't identify this VIN automatically. Double-check the characters — if it's " +
          "right, carry on and we'll confirm the vehicle by phone.",
      );
      return;
    }

    var codes = String(v.ErrorCode || "").split(",");
    var warning = "";
    if (codes.indexOf("1") !== -1) {
      warning =
        "The check digit on this VIN doesn't validate, which usually means a typo. " +
        "Please confirm it matches the vehicle exactly.";
    } else if (codes.indexOf("8") !== -1 || !v.Model) {
      warning = "Only partial data is on file for this VIN. We'll confirm the details with you.";
    }
    renderVinFound(v, warning);
  }

  function maybeLookup() {
    var vin = vinEl.value.trim().toUpperCase();
    if (vin.length !== 17 || /[IOQ]/.test(vin)) {
      if (vin !== lastLookedUp) renderVinIdle();
      return;
    }
    if (vin === lastLookedUp && !vinResult.hidden) return;
    lookupVin(vin);
  }

  // VIN is uppercase alphanumeric only; normalise as the user types.
  vinEl.addEventListener("input", function () {
    var caret = this.selectionStart;
    this.value = this.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
    try {
      this.setSelectionRange(caret, caret);
    } catch (e) {
      /* some browsers dislike this on certain input types */
    }
    window.clearTimeout(vinDebounce);
    vinDebounce = window.setTimeout(maybeLookup, 400);
  });

  vinLookupBtn.addEventListener("click", function () {
    window.clearTimeout(vinDebounce);
    var vin = vinEl.value.trim().toUpperCase();
    if (vin.length !== 17) {
      validateField("vin");
      vinEl.focus();
      return;
    }
    lastLookedUp = ""; // force a re-run even if unchanged
    maybeLookup();
  });

  /* ---------- submit ---------- */

  function setBusy(busy) {
    submitBtn.disabled = busy;
    submitBtn.classList.toggle("is-busy", busy);
    btnLabel.textContent = busy ? "Submitting…" : "Continue to inspection fee →";
  }

  function showFormError(message) {
    formError.innerHTML = "";
    var p = document.createElement("p");
    p.style.margin = "0";
    p.innerHTML = message;
    formError.appendChild(p);
    formError.hidden = false;
    formError.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    formError.hidden = true;

    if (!validateAll()) {
      showFormError(
        "Some details need fixing before we can continue — see the highlighted fields.",
      );
      return;
    }

    setBusy(true);

    var payload = {};
    new FormData(form).forEach(function (value, key) {
      payload[key] = value;
    });

    // A readable subject line makes the notification email easier to triage.
    payload.subject = "Test drive registration " + payload.reference + " — " + payload["Full name"];

    fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
    })
      .then(function (res) {
        return res.json().then(function (data) {
          return { ok: res.ok, data: data };
        });
      })
      .then(function (result) {
        if (!result.ok || !result.data.success) {
          throw new Error(result.data.message || "Web3Forms rejected the submission.");
        }

        // Hand the booking over to the inspection-fee page. Only the details
        // needed to show a summary — no licence, insurance or payment data.
        try {
          sessionStorage.setItem(
            STORAGE_KEY,
            JSON.stringify({
              reference: payload.reference,
              name: payload["Full name"],
              email: payload.Email,
              phone: payload.Phone,
              vehicle: payload.Vehicle || "Vehicle to be confirmed",
              vehicleId: payload.VIN || "",
              address:
                payload["Street address"] +
                ", " +
                payload.City +
                ", " +
                payload.State +
                " " +
                payload.ZIP,
              date: payload["Preferred date"],
              time: payload["Preferred time"],
              submittedAt: new Date().toISOString(),
            }),
          );
        } catch (e) {
          /* private browsing can block sessionStorage — the next page copes */
        }

        window.location.href = NEXT_PAGE;
      })
      .catch(function (err) {
        setBusy(false);
        showFormError(
          "<strong>We couldn't submit your registration.</strong> " +
            (err && err.message ? err.message : "Please check your connection and try again.") +
            ' If this keeps happening, call us on <a href="tel:7655079658">(765) 507-9658</a>.',
        );
      });
  });
})();
