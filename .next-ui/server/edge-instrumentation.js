// runtime can't be in strict mode because a global variable is assign and maybe created.
/*
 * ATTENTION: An "eval-source-map" devtool has been used.
 * This devtool is neither made for production nor for readable output files.
 * It uses "eval()" calls to create a separate source file with attached SourceMaps in the browser devtools.
 * If you are trying to read the output file, select a different devtool (https://webpack.js.org/configuration/devtool/)
 * or disable the default devtool with "devtool: false".
 * If you are looking for production-ready output files, see mode: "production" (https://webpack.js.org/configuration/mode/).
 */
(self["webpackChunk_N_E"] = self["webpackChunk_N_E"] || []).push([["instrumentation"],{

/***/ "(instrument)/./src/instrumentation.ts":
/*!********************************!*\
  !*** ./src/instrumentation.ts ***!
  \********************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

"use strict";
eval("__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   register: () => (/* binding */ register)\n/* harmony export */ });\n/**\n * Next.js Instrumentation Hook\n *\n * Runs once when the Node.js server process starts.\n * Starts background schedulers: CartRecoveryScheduler e ScheduledCampaignScheduler.\n * Also auto-syncs Evolution webhook URLs so WhatsApp recovers automatically\n * after every deploy without manual intervention.\n *\n * Faxina: o AutoSimulatorScheduler (tick de 60s) foi DESLIGADO — gravava\n * telemetria que nenhum produto lê (painel em rota não-navegável). O serviço e\n * a rota /ai-simulator permanecem no código, só não rodam no boot.\n */ async function register() {\n    if (false) {}\n}\n//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKGluc3RydW1lbnQpLy4vc3JjL2luc3RydW1lbnRhdGlvbi50cyIsIm1hcHBpbmdzIjoiOzs7O0FBQUE7Ozs7Ozs7Ozs7O0NBV0MsR0FFTSxlQUFlQTtJQUNwQixJQUFJQyxLQUFxQyxFQUFFLEVBaUIxQztBQUNIIiwic291cmNlcyI6WyJ3ZWJwYWNrOi8vX05fRS8uL3NyYy9pbnN0cnVtZW50YXRpb24udHM/NGZhYiJdLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIE5leHQuanMgSW5zdHJ1bWVudGF0aW9uIEhvb2tcbiAqXG4gKiBSdW5zIG9uY2Ugd2hlbiB0aGUgTm9kZS5qcyBzZXJ2ZXIgcHJvY2VzcyBzdGFydHMuXG4gKiBTdGFydHMgYmFja2dyb3VuZCBzY2hlZHVsZXJzOiBDYXJ0UmVjb3ZlcnlTY2hlZHVsZXIgZSBTY2hlZHVsZWRDYW1wYWlnblNjaGVkdWxlci5cbiAqIEFsc28gYXV0by1zeW5jcyBFdm9sdXRpb24gd2ViaG9vayBVUkxzIHNvIFdoYXRzQXBwIHJlY292ZXJzIGF1dG9tYXRpY2FsbHlcbiAqIGFmdGVyIGV2ZXJ5IGRlcGxveSB3aXRob3V0IG1hbnVhbCBpbnRlcnZlbnRpb24uXG4gKlxuICogRmF4aW5hOiBvIEF1dG9TaW11bGF0b3JTY2hlZHVsZXIgKHRpY2sgZGUgNjBzKSBmb2kgREVTTElHQURPIOKAlCBncmF2YXZhXG4gKiB0ZWxlbWV0cmlhIHF1ZSBuZW5odW0gcHJvZHV0byBsw6ogKHBhaW5lbCBlbSByb3RhIG7Do28tbmF2ZWfDoXZlbCkuIE8gc2VydmnDp28gZVxuICogYSByb3RhIC9haS1zaW11bGF0b3IgcGVybWFuZWNlbSBubyBjw7NkaWdvLCBzw7MgbsOjbyByb2RhbSBubyBib290LlxuICovXG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiByZWdpc3RlcigpIHtcbiAgaWYgKHByb2Nlc3MuZW52Lk5FWFRfUlVOVElNRSA9PT0gXCJub2RlanNcIikge1xuICAgIGNvbnN0IHsgQ2FydFJlY292ZXJ5U2NoZWR1bGVyIH0gPSBhd2FpdCBpbXBvcnQoXG4gICAgICBcIi4vc2VydmljZXMvb3JkZXIvQ2FydFJlY292ZXJ5U2NoZWR1bGVyXCJcbiAgICApO1xuICAgIENhcnRSZWNvdmVyeVNjaGVkdWxlci5zdGFydCgpO1xuXG4gICAgY29uc3QgeyBTY2hlZHVsZWRDYW1wYWlnblNjaGVkdWxlciB9ID0gYXdhaXQgaW1wb3J0KFxuICAgICAgXCIuL3NlcnZpY2VzL2NybS9TY2hlZHVsZWRDYW1wYWlnblNjaGVkdWxlclwiXG4gICAgKTtcbiAgICBTY2hlZHVsZWRDYW1wYWlnblNjaGVkdWxlci5zdGFydCgpO1xuXG4gICAgLy8gUmUtcmVnaXN0ZXIgRXZvbHV0aW9uIHdlYmhvb2sgYWZ0ZXIgZXZlcnkgZGVwbG95IHNvIFdoYXRzQXBwIG5ldmVyIGdvZXNcbiAgICAvLyBzaWxlbnQgZHVlIHRvIEV2b2x1dGlvbiBtYXJraW5nIHRoZSBlbmRwb2ludCBhcyBmYWlsZWQgZHVyaW5nIGRvd250aW1lLlxuICAgIGNvbnN0IHsgc3luY0FsbEV2b2x1dGlvbldlYmhvb2tzIH0gPSBhd2FpdCBpbXBvcnQoXG4gICAgICBcIi4vc2VydmljZXMvZXZvbHV0aW9uL0V2b2x1dGlvbldlYmhvb2tTdGFydHVwU3luY1wiXG4gICAgKTtcbiAgICB2b2lkIHN5bmNBbGxFdm9sdXRpb25XZWJob29rcygpO1xuICB9XG59XG5cbiJdLCJuYW1lcyI6WyJyZWdpc3RlciIsInByb2Nlc3MiLCJlbnYiLCJORVhUX1JVTlRJTUUiLCJDYXJ0UmVjb3ZlcnlTY2hlZHVsZXIiLCJzdGFydCIsIlNjaGVkdWxlZENhbXBhaWduU2NoZWR1bGVyIiwic3luY0FsbEV2b2x1dGlvbldlYmhvb2tzIl0sInNvdXJjZVJvb3QiOiIifQ==\n//# sourceURL=webpack-internal:///(instrument)/./src/instrumentation.ts\n");

/***/ })

},
/******/ __webpack_require__ => { // webpackRuntimeModules
/******/ var __webpack_exec__ = (moduleId) => (__webpack_require__(__webpack_require__.s = moduleId))
/******/ var __webpack_exports__ = (__webpack_exec__("(instrument)/./src/instrumentation.ts"));
/******/ (_ENTRIES = typeof _ENTRIES === "undefined" ? {} : _ENTRIES).middleware_instrumentation = __webpack_exports__;
/******/ }
]);