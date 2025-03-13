export type NumericString = `${number}` | string

export interface Groth16Proof {
  pi_a: NumericString[]
  pi_b: NumericString[][]
  pi_c: NumericString[]
  protocol: string
  curve: string
}

export type AnonAadhaarProof = {
  groth16Proof: Groth16Proof // 3 points on curve if we use groth16
  pubkeyHash: string
  timestamp: string
  nullifierSeed: string
  nullifier: string
  signalHash: string
  ageAbove18: string
  gender: string
  pincode: string
  state: string
}
