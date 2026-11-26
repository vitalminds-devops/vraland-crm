/** The loss reasons every organization starts with; migration 0078 adds them where none exist. */
export const defaultLostReasons = [
  {
    name: "Price too high",
    description: "The client considered the property or offer outside their budget.",
  },
  {
    name: "Financing declined",
    description: "The buyer or tenant could not secure the required financing.",
  },
  {
    name: "Chose another property",
    description: "The client selected a competing property.",
  },
  {
    name: "Chose another agent",
    description: "The client continued the transaction with another agent or brokerage.",
  },
  {
    name: "Property unavailable",
    description: "The property was sold, rented, withdrawn, or otherwise became unavailable.",
  },
  {
    name: "Terms not accepted",
    description: "The parties could not agree on price, contingencies, or other terms.",
  },
  {
    name: "Client unresponsive",
    description: "The client stopped responding after reasonable follow-up attempts.",
  },
  {
    name: "Timeline changed",
    description: "The client postponed or cancelled their real-estate plans.",
  },
  {
    name: "Location mismatch",
    description: "The available property location did not meet the client's requirements.",
  },
  {
    name: "Property condition",
    description: "The property condition did not meet the client's expectations.",
  },
  {
    name: "Duplicate or invalid lead",
    description: "The opportunity originated from a duplicate or invalid lead.",
  },
  {
    name: "Other",
    description: "A reason not represented by the standard options; explain it in the loss notes.",
  },
];
