/* ---------------------------------------------------------------------------
   checkout.html — billing details + manual payment confirmation.

   There is deliberately no card number, expiry or CVC field on this page.
   Web3Forms delivers submissions as plaintext email; putting a PAN or CVC
   through it would breach PCI-DSS (storing CVC after authorisation is
   prohibited outright) and would not charge anyone in any case, since
   Web3Forms is a mail relay and has no connection to the card networks.
   When a processor is chosen, the card option becomes a redirect to their
   hosted checkout — see the CARD_CHECKOUT_URL note below.
--------------------------------------------------------------------------- */
(function () {
  "use strict";

  /* =========================================================================
     To switch card payments on: create a $10 payment link with your processor
     (Stripe → Payment links, Square → Checkout links, PayPal → payment link)
     and paste it here. The card option enables itself and redirects to it.
     ========================================================================= */
  var CARD_CHECKOUT_URL = "";

  var ENDPOINT = "https://api.web3forms.com/submit";
  var STORAGE_KEY = "aas.testdrive.registration";
  var BANK_EMAIL = "info@americanautoshipping.com";

  /* This page gets hand-edited: sections are added and removed as the flow
     changes. Every lookup below is therefore allowed to come back null, and
     each block checks before it touches anything. A missing section should
     cost you that section's behaviour — not the whole script, which would
     silently take the submit handler with it and let the form do a native
     GET that drops the customer's data. */
  var $ = function (id) {
    return document.getElementById(id);
  };

  var form = $("checkoutForm");
  var submitBtn = $("submitBtn");
  if (!form || !submitBtn) return; // nothing to wire up

  var btnLabel = submitBtn.querySelector(".btn-label");
  var formError = $("formError");
  var summaryList = $("summaryList");
  var stateSel = $("state");
  var stateText = $("stateText");

  if ($("footerYear")) $("footerYear").textContent = String(new Date().getFullYear());

  var US_STATES = [
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

  // Kept short deliberately: this is a US operation, with the common
  // English-speaking origins customers actually ship from.
  var COUNTRIES = [
    "United States",
    "Canada",
    "Mexico",
    "United Kingdom",
    "Australia",
    "Germany",
    "France",
    "Japan",
    "Other",
  ];

  /* ---------- populate selects ---------- */

  var countrySel = $("country");

  (function fillCountries() {
    if (!countrySel) return;
    var frag = document.createDocumentFragment();
    COUNTRIES.forEach(function (c) {
      var o = document.createElement("option");
      o.value = c;
      o.textContent = c;
      frag.appendChild(o);
    });
    countrySel.appendChild(frag);
    countrySel.value = "United States";
  })();

  (function fillStates() {
    if (!stateSel) return;
    var frag = document.createDocumentFragment();
    US_STATES.forEach(function (s) {
      var o = document.createElement("option");
      o.value = s[0];
      o.textContent = s[1];
      frag.appendChild(o);
    });
    stateSel.appendChild(frag);
  })();

  function isUS() {
    return !countrySel || countrySel.value === "United States";
  }

  // Outside the US the state list is meaningless — swap in a free-text box.
  function syncStateControl() {
    if (!stateSel || !stateText) return;
    var us = isUS();
    stateSel.hidden = !us;
    stateSel.disabled = !us;
    stateText.hidden = us;
    stateText.disabled = us;
  }
  if (countrySel) countrySel.addEventListener("change", syncStateControl);
  syncStateControl();

  /* ---------- booking summary ---------- */

  function readBooking() {
    try {
      var raw = sessionStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function addRow(key, value) {
    if (!value || !summaryList) return;
    var li = document.createElement("li");
    var k = document.createElement("span");
    var v = document.createElement("span");
    k.className = "k";
    v.className = "v";
    k.textContent = key;
    v.textContent = value; // textContent — storage contents can't inject markup
    li.appendChild(k);
    li.appendChild(v);
    summaryList.appendChild(li);
  }

  var booking = readBooking();
  var reference = (booking && booking.reference) || "";

  function setValue(id, value) {
    var el = $(id);
    if (el && value) el.value = value;
  }

  if (reference) {
    addRow("Reference", reference);
    addRow("Vehicle", booking.vehicle);
    addRow("Deliver to", booking.address);
    addRow("Name", booking.name);
    setValue("reference", reference);

    // Save the customer retyping what they already gave us.
    setValue("email", booking.email);
    setValue("phone", booking.phone);
    if (booking.name) {
      var parts = String(booking.name).trim().split(/\s+/);
      if (parts.length > 1) {
        setValue("firstName", parts.shift());
        setValue("lastName", parts.join(" "));
      } else {
        setValue("firstName", booking.name);
      }
    }
  } else if ($("noBooking")) {
    $("noBooking").hidden = false;
  }

  /* ---------- bank-details email link ---------- */

  (function buildBankLink() {
    if (!$("bankEmail")) return;
    var subject = "Bank transfer details request" + (reference ? " — " + reference : "");
    var body =
      "Hello,\n\nPlease send me your bank details so I can pay the $10 refundable " +
      "inspection fee.\n\n" +
      (reference ? "Booking reference: " + reference + "\n" : "") +
      "\nThank you.";
    $("bankEmail").href =
      "mailto:" +
      BANK_EMAIL +
      "?subject=" +
      encodeURIComponent(subject) +
      "&body=" +
      encodeURIComponent(body);
  })();

  /* ---------- method switching ---------- */

  var TXN_HINTS = {
    "Cash App": [
      "(Cash App payment note)",
      "The note you put on the Cash App payment, or the receipt ID.",
    ],
    "Bank transfer": [
      "(bank reference)",
      "The reference you quoted on the transfer, or your bank's confirmation number.",
    ],
    Bitcoin: ["(transaction ID)", "The on-chain transaction ID (txid) from your wallet."],
    Card: ["(receipt number)", "The receipt number from the card payment."],
  };

  function currentMethod() {
    var checked = document.querySelector('input[name="method"]:checked');
    if (checked) return checked.value;
    // Single-method pages (card / cashapp / bitcoin / bank) have no chooser —
    // they declare their method on the form element instead.
    return form.getAttribute("data-payment-method") || "";
  }

  function syncMethod() {
    var method = currentMethod();
    if ($("methodField")) $("methodField").value = method;

    Array.prototype.forEach.call(document.querySelectorAll(".panel"), function (p) {
      p.classList.toggle("is-active", p.getAttribute("data-panel") === method);
    });

    var hint = TXN_HINTS[method];
    if (hint && $("txnHint") && $("txnHelp")) {
      $("txnHint").textContent = hint[0];
      $("txnHelp").textContent = hint[1];
    }
  }

  Array.prototype.forEach.call(document.querySelectorAll('input[name="method"]'), function (radio) {
    radio.addEventListener("change", syncMethod);
  });

  // Enable the card option only once a hosted checkout exists to send people to.
  var cardRadio = $("mCard");
  if (CARD_CHECKOUT_URL && cardRadio) {
    cardRadio.disabled = false;
    var tag = cardRadio.parentNode.querySelector(".method__tag");
    if (tag) {
      tag.className = "method__tag tag--reversible";
      tag.textContent = "Refundable";
    }
  }

  syncMethod();

  /* ---------- copy buttons ---------- */

  Array.prototype.forEach.call(document.querySelectorAll(".copy-btn"), function (btn) {
    btn.addEventListener("click", function () {
      var text = $(btn.getAttribute("data-copy")).textContent.trim();
      var done = function () {
        var original = btn.textContent;
        btn.textContent = "Copied";
        btn.classList.add("is-copied");
        window.setTimeout(function () {
          btn.textContent = original;
          btn.classList.remove("is-copied");
        }, 1800);
      };

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, fallback);
      } else {
        fallback();
      }

      // execCommand path for file:// and older browsers, where the async
      // Clipboard API is unavailable.
      function fallback() {
        var ta = document.createElement("textarea");
        ta.value = text;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        try {
          document.execCommand("copy");
          done();
        } catch (e) {
          btn.textContent = "Select it";
        }
        document.body.removeChild(ta);
      }
    });
  });

  /* ---------- validation ---------- */

  var VALIDATORS = {
    firstName: function (v) {
      return v.trim() ? "" : "Please enter your first name.";
    },
    lastName: function (v) {
      return v.trim() ? "" : "Please enter your last name.";
    },
    country: function (v) {
      return v ? "" : "Please select a country.";
    },
    state: function () {
      if (isUS()) {
        return !stateSel || stateSel.value ? "" : "Please select a state.";
      }
      return !stateText || stateText.value.trim() ? "" : "Please enter your state or region.";
    },
    city: function (v) {
      return v.trim() ? "" : "Please enter your city.";
    },
    zip: function (v) {
      if (!v.trim()) return "Please enter your ZIP or postal code.";
      if (isUS() && !/^\d{5}(-\d{4})?$/.test(v.trim())) {
        return "Enter a 5-digit ZIP (or ZIP+4).";
      }
      return "";
    },
    address: function (v) {
      return v.trim() ? "" : "Please enter your street address.";
    },
    email: function (v) {
      if (!v.trim()) return "Please enter your email address.";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim())) return "That email address isn't valid.";
      return "";
    },
    phone: function (v) {
      var digits = v.replace(/\D/g, "");
      if (!digits) return "Please enter a phone number.";
      if (digits.length < 10) return "Enter a 10-digit phone number.";
      return "";
    },
    txnRef: function (v) {
      return v.trim() ? "" : "Please tell us how to identify your payment.";
    },
  };

  var CHECKBOXES = {
    agreeSent: "Please confirm you've sent the payment.",
    agreeFinal: "Please confirm you understand how the refund works.",
  };

  // Only validate what is actually on the page right now.
  function present(id) {
    return !!$(id);
  }

  function showError(id, message) {
    var field = $(id);
    if (!field) return true;
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
    if (!present(id)) return true;
    return showError(id, VALIDATORS[id]($(id).value));
  }

  function validateAll() {
    var firstBad = null;
    var ok = true;

    Object.keys(VALIDATORS)
      .filter(present)
      .forEach(function (id) {
        if (!validateField(id)) {
          ok = false;
          if (!firstBad) firstBad = id;
        }
      });

    Object.keys(CHECKBOXES)
      .filter(present)
      .forEach(function (id) {
        if (!showError(id, $(id).checked ? "" : CHECKBOXES[id])) {
          ok = false;
          if (!firstBad) firstBad = id;
        }
      });

    if (!currentMethod()) {
      ok = false;
      showFormError("Please choose a payment method.");
    }

    if (firstBad) $(firstBad).focus();
    return ok;
  }

  Object.keys(VALIDATORS)
    .filter(present)
    .forEach(function (id) {
      var el = $(id);
      el.addEventListener("blur", function () {
        validateField(id);
      });
      el.addEventListener("input", function () {
        if (el.getAttribute("aria-invalid") === "true") validateField(id);
      });
    });
  Object.keys(CHECKBOXES)
    .filter(present)
    .forEach(function (id) {
      $(id).addEventListener("change", function () {
        showError(id, $(id).checked ? "" : CHECKBOXES[id]);
      });
    });

  /* ---------- submit ---------- */

  function setBusy(busy) {
    submitBtn.disabled = busy;
    submitBtn.classList.toggle("is-busy", busy);
    if (btnLabel) btnLabel.textContent = busy ? "Submitting…" : "Submit payment confirmation";
  }

  function showFormError(message) {
    if (!formError) return window.alert(message.replace(/<[^>]+>/g, ""));
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
    if (formError) formError.hidden = true;

    if (!validateAll()) {
      // validateAll may already have shown a message (e.g. no method chosen).
      if (!formError || formError.hidden) {
        showFormError("Some details need fixing — see the highlighted fields.");
      }
      return;
    }

    setBusy(true);

    var payload = {};
    new FormData(form).forEach(function (value, key) {
      payload[key] = value;
    });

    if (!payload.reference) {
      payload.reference = "(no booking reference)";
    }
    payload.subject =
      "Payment confirmation " +
      payload.reference +
      " — " +
      payload["Payment method"] +
      " — " +
      payload["First name"] +
      " " +
      payload["Last name"];

    fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
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
        form.hidden = true;
        if ($("doneRef")) {
          $("doneRef").textContent = reference || payload["Payment reference"] || "";
        }
        if ($("doneCard")) {
          $("doneCard").hidden = false;
          $("doneCard").scrollIntoView({ behavior: "smooth", block: "center" });
        }
      })
      .catch(function (err) {
        setBusy(false);
        showFormError(
          "<strong>We couldn't submit your confirmation.</strong> " +
            (err && err.message ? err.message : "Please check your connection and try again.") +
            ' Your payment is unaffected — call <a href="tel:7655079658">(765) 507-9658</a>' +
            " and we'll sort it out.",
        );
      });
  });
})();
