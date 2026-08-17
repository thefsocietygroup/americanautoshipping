/* ---------------------------------------------------------------------------
   Inspection fee page — $100 refundable, charged to confirm a test drive.

   This page never touches card data. It reads the booking summary left by the
   registration form and hands the customer to a hosted checkout, which is the
   only PCI-compliant way to take a card from a static site. Typing card numbers
   into a form on this domain — or emailing them through Web3Forms — would put
   the business in scope for PCI-DSS and is not something this page will do.
--------------------------------------------------------------------------- */
(function () {
  "use strict";

  /* =========================================================================
     CONFIGURE ME — paste your hosted checkout URL below.

     Stripe:  Dashboard → Payment links → create a $100 link
              https://buy.stripe.com/xxxxxxxxxxxx
     PayPal:  Business tools → PayPal buttons, or a $100 payment link
              https://www.paypal.com/ncp/payment/xxxxxxxx
     Square:  Online → Checkout links
              https://square.link/u/xxxxxxxx

     Leave it empty and the pay button stays disabled — nothing can be charged.
     ========================================================================= */
  var CHECKOUT_URL = "";

  /* Stripe payment links accept these as query params, so the payment shows up
     in your dashboard already tied to the booking. Harmless on other providers,
     which simply ignore unknown params — set to false if yours objects. */
  var PASS_REFERENCE_TO_CHECKOUT = true;

  var STORAGE_KEY = "aas.testdrive.registration";

  var payBtn = document.getElementById("payBtn");
  var btnLabel = payBtn.querySelector(".btn-label");
  var summaryCard = document.getElementById("summaryCard");
  var summaryList = document.getElementById("summaryList");
  var noRegistration = document.getElementById("noRegistration");
  var notConfigured = document.getElementById("notConfigured");
  var footerYear = document.getElementById("footerYear");

  if (footerYear) footerYear.textContent = String(new Date().getFullYear());

  /* ---------- booking summary ---------- */

  function readBooking() {
    try {
      var raw = sessionStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null; // private browsing, or somebody hand-edited the entry
    }
  }

  function prettyDate(iso) {
    if (!iso) return "";
    var parts = iso.split("-");
    if (parts.length !== 3) return iso;
    var d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(undefined, {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  function addRow(key, value) {
    if (!value) return;
    var li = document.createElement("li");
    var k = document.createElement("span");
    var v = document.createElement("span");
    k.className = "k";
    v.className = "v";
    k.textContent = key;
    v.textContent = value; // textContent, so nothing from storage can inject markup
    li.appendChild(k);
    li.appendChild(v);
    summaryList.appendChild(li);
  }

  var booking = readBooking();

  if (booking && booking.reference) {
    addRow("Reference", booking.reference);
    addRow("Name", booking.name);
    addRow("Vehicle", booking.vehicle);
    addRow("VIN / Listing ID", booking.vehicleId);
    addRow("Deliver to", booking.address);
    addRow("Date", prettyDate(booking.date));
    addRow("Time window", booking.time);
    addRow("Confirmation to", booking.email);
    summaryCard.hidden = false;
  } else {
    noRegistration.hidden = false;
  }

  /* ---------- checkout hand-off ---------- */

  function buildCheckoutUrl() {
    if (!PASS_REFERENCE_TO_CHECKOUT || !booking) return CHECKOUT_URL;
    try {
      var url = new URL(CHECKOUT_URL);
      if (booking.reference) url.searchParams.set("client_reference_id", booking.reference);
      if (booking.email) url.searchParams.set("prefilled_email", booking.email);
      return url.toString();
    } catch (e) {
      return CHECKOUT_URL; // not a parseable absolute URL — send it as given
    }
  }

  if (!CHECKOUT_URL) {
    notConfigured.hidden = false;
    payBtn.disabled = true;
    btnLabel.textContent = "Payment not configured";
    return;
  }

  payBtn.addEventListener("click", function () {
    payBtn.disabled = true;
    payBtn.classList.add("is-busy");
    btnLabel.textContent = "Opening secure checkout…";
    window.location.href = buildCheckoutUrl();
  });
})();
