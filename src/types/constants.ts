export const accessControlConditions: {
  name: string
  condition: any
}[] = [
  {
    name: "Proof of Humanity",
    condition: {
      conditionType: "evmBasic",
      contractAddress: "0xC5E9dDebb09Cd64DfaCab4011A0D5cEDaf7c9BDb",
      standardContractType: "ProofOfHumanity",
      chain: "amoy",
      method: "isRegistered",
      parameters: [":userAddress"],
      returnValueTest: {
        comparator: "=",
        value: "true",
      },
    },
  },
  {
    name: "NFT Owner",
    condition: {
      conditionType: "evmBasic",
      contractAddress: "0xCd2AE5e5371A6f667726A76B36D5CC161a5fB3e6",
      standardContractType: "ERC721",
      chain: "amoy",
      method: "ownerOf",
      parameters: ["1"],
      returnValueTest: {
        comparator: "=",
        value: ":userAddress",
      },
    },
  },
  {
    name: "Burning Man 2021 POAP",
    condition: {
      conditionType: "evmBasic",
      contractAddress: "0x22C1f6050E56d2876009903609a2cC3fEf83B415",
      standardContractType: "POAP",
      chain: "amoy",
      method: "tokenURI",
      parameters: [],
      returnValueTest: {
        comparator: "contains",
        value: "Burning Man 2021",
      },
    },
  },
  {
    name: "Timelock",
    condition: {
      conditionType: "evmBasic",
      contractAddress: "",
      standardContractType: "timestamp",
      chain: "amoy",
      method: "eth_getBlockByNumber",
      parameters: ["latest"],
      returnValueTest: {
        comparator: ">=",
        value: "1733600192",
      },
    },
  },
  {
    name: "Token Holder",
    condition: {
      contractAddress: "",
      standardContractType: "",
      conditionType: "evmBasic",
      chain: "amoy",
      method: "eth_getBalance",
      parameters: [":userAddress"],
      returnValueTest: {
        comparator: ">",
        value: "0",
      },
    },
  },
  {
    name: "AnonAadhaar",
    condition: {
      conditionType: "evmContract",
      contractAddress: "0x6bE8Cec7a06BA19c39ef328e8c8940cEfeF7E281",
      functionName: "verifyAnonAadhaarProof",
      functionParams: [
        ":litParam:nullifierSeed",
        ":litParam:nullifier",
        ":litParam:timestamp",
        "1",
        ":litParam:revealArray",
        ":litParam:groth16Proof",
      ],
      functionAbi: {
        inputs: [
          {
            internalType: "uint256",
            name: "nullifierSeed",
            type: "uint256",
          },
          {
            internalType: "uint256",
            name: "nullifier",
            type: "uint256",
          },
          {
            internalType: "uint256",
            name: "timestamp",
            type: "uint256",
          },
          {
            internalType: "uint256",
            name: "signal",
            type: "uint256",
          },
          {
            internalType: "uint256[4]",
            name: "revealArray",
            type: "uint256[4]",
          },
          {
            internalType: "uint256[8]",
            name: "groth16Proof",
            type: "uint256[8]",
          },
        ],
        name: "verifyAnonAadhaarProof",
        outputs: [
          {
            internalType: "bool",
            name: "",
            type: "bool",
          },
        ],
        stateMutability: "view",
        type: "function",
      },
      chain: "sepolia",
      returnValueTest: {
        key: "",
        comparator: "=",
        value: "true",
      },
    },
  },
]
