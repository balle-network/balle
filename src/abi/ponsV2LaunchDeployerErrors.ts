// ABI of the verified Pons V2 deployment on Robinhood Chain (Sourcify, chain 4663). Do not edit by hand.
export const ponsV2LaunchDeployerErrorsAbi = [
  {
    "inputs": [],
    "name": "Create2EmptyBytecode",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "FailedDeployment",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "balance",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "needed",
        "type": "uint256"
      }
    ],
    "name": "InsufficientBalance",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "MetadataTooLong",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "NotFactory",
    "type": "error"
  }
] as const;
