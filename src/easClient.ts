import {
  EAS,
  GetSchemaParams,
  NO_EXPIRATION,
  RegisterSchemaParams,
  SchemaEncoder,
  SchemaRegistry,
} from "@ethereum-attestation-service/eas-sdk"
import { LIT_RPC } from "@lit-protocol/constants"
import { ethers } from "ethers"
import { LitProtocol } from "./LitprotocolClient.js"
import { UnifiedAccessControlConditions } from "@lit-protocol/types"
import { uint8arrayFromString } from "@lit-protocol/lit-node-client"

const CONFIG: Record<string, any> = {
  "matic-amoy": {
    EASContractAddress: "0xb101275a60d8bfb14529C421899aD7CA1Ae5B5Fc",
    SchemaRegistryContractAddress: "0x23c5701A1BDa89C61d181BD79E5203c730708AE7",
    ENCRYPTION_SCHEMA_ID:
      "0xad7f1c5035b3200210b1ef59eaa6681368866406facfe757065de4f85632a018",
  },
  sepolia: {
    EASContractAddress: "0xC2679fBD37d54388Ce493F1DB75320D236e1815e",
    SchemaRegistryContractAddress: "0x0a7E2Ff54e76B8E6659aedc9103FB21c038050D0",
    ENCRYPTION_SCHEMA_ID:
      "0xad7f1c5035b3200210b1ef59eaa6681368866406facfe757065de4f85632a018",
  },
  "scroll-sepolia": {
    EASContractAddress: "0xaEF4103A04090071165F78D45D83A0C0782c2B2a",
    SchemaRegistryContractAddress: "0x55D26f9ae0203EF95494AE4C170eD35f4Cf77797",
    ENCRYPTION_SCHEMA_ID: "",
  },
  "base-sepolia": {
    EASContractAddress: "0x4200000000000000000000000000000000000021",
    SchemaRegistryContractAddress: "0x4200000000000000000000000000000000000020",
    ENCRYPTION_SCHEMA_ID: "",
  },
}

export interface EncryptedAttestation {
  encryptedData: string
  hash: string
  conditions: string
  schema: string
}

export class EasLitClient {
  schemaRegistry: SchemaRegistry
  eas: EAS
  lit: LitProtocol
  easSigner: ethers.Wallet
  network: string

  constructor(options: { network: string; wallet: ethers.Wallet }) {
    const { network, wallet } = options
    if (!CONFIG[network]) {
      throw new Error("Chain not supported")
    }
    this.network = network

    // initialize signer
    const easProvider = ethers.getDefaultProvider(network)
    this.easSigner = wallet.connect(easProvider)

    // initialize eas
    this.eas = new EAS(CONFIG[network].EASContractAddress)
    this.eas.connect(this.easSigner)

    // initialize schema registry
    this.schemaRegistry = new SchemaRegistry(
      CONFIG[network].SchemaRegistryContractAddress
    )
    this.schemaRegistry.connect(this.easSigner)

    // initialize lit clients
    const litProvider = new ethers.JsonRpcProvider(
      LIT_RPC.CHRONICLE_YELLOWSTONE
    )
    const litSigner = wallet.connect(litProvider)
    this.lit = new LitProtocol(litSigner)
  }

  async createSchema(params: RegisterSchemaParams) {
    return await this.schemaRegistry.register(params)
  }

  async getSchema(params: GetSchemaParams) {
    return await this.schemaRegistry.getSchema(params)
  }

  async createAttestation(
    data: Record<string, any>,
    schema: string,
    options: {
      recipient?: string
      linkedAttestationId?: string
      expirationTime?: bigint
      revocable?: boolean
      gated?: boolean
      accessControlConditions?: UnifiedAccessControlConditions
    }
  ) {
    let encodedData: string
    let schemaUsed: string
    if (options.gated) {
      if (!options.accessControlConditions?.length) {
        throw new Error(
          "Provide atleast one valid condition for gated attestations"
        )
      }
      await this.lit.connect()
      const { encryptedString: encryptedData, stringHash } =
        await this.lit.encrypt(
          uint8arrayFromString(JSON.stringify(data)),
          options.accessControlConditions
        )

      const encryptionSchema = await this.getSchema({
        uid: CONFIG[this.network].ENCRYPTION_SCHEMA_ID,
      })

      const res = EasLitClient.encodeData(encryptionSchema.schema, {
        encryptedData: encryptedData,
        hash: stringHash,
        conditions: JSON.stringify(options.accessControlConditions),
        schema: schema || "",
      })

      if (!res) {
        throw new Error("Invalid data")
      }

      encodedData = res
      schemaUsed = CONFIG[this.network].ENCRYPTION_SCHEMA_ID
    } else {
      const schemaData = await this.getSchema({
        uid: schema,
      })
      const res = EasLitClient.encodeData(schemaData.schema, data)
      if (!res) {
        throw new Error("Invalid data")
      }

      encodedData = res
      schemaUsed = schema
    }

    const transaction = await this.eas.attest({
      schema: schemaUsed,
      data: {
        recipient: options.recipient || (await this.easSigner.getAddress()),
        expirationTime: options.expirationTime || NO_EXPIRATION,
        revocable: options.revocable,
        data: encodedData,
        refUID: options.linkedAttestationId,
      },
    })

    const newAttestationUID = await transaction.wait()

    console.log("New attestation UID:", newAttestationUID)
    console.log("Transaction receipt:", transaction.receipt)

    return newAttestationUID
  }

  static encodeData(schema: string, data: Record<string, any>) {
    // Parse the schema into types and names
    const schemaFields = schema.split(",").map((field) => {
      const [type, name] = field.trim().split(" ")
      return { type, name }
    })

    const values = schemaFields.map((field) => ({
      name: field.name,
      type: field.type,
      value: data[field.name],
    }))

    // Encode using ethers.js AbiCoder
    const schemaEncoder = new SchemaEncoder(schema)
    const encodedData = schemaEncoder.encodeData(values)
    if (schemaEncoder.isEncodedDataValid(encodedData)) {
      return encodedData
    } else {
      return null
    }
  }

  async getAttestation(
    attestationId: string,
    options: {
      gated?: boolean
      resources?: string[]
    }
  ) {
    const attestation = await this.eas.getAttestation(attestationId)
    const { schema } = await this.getSchema({ uid: attestation.schema })

    const schemaEncoder = new SchemaEncoder(schema)
    if (schemaEncoder.isEncodedDataValid(attestation.data)) {
      let decodedData: Record<string, any> = {}
      schemaEncoder
        .decodeData(attestation.data)
        .forEach((schemaDecodedItem) => {
          decodedData[schemaDecodedItem.name] = schemaDecodedItem.value.value
        })
      if (options.gated) {
        await this.lit.connect()
        const decryptedResult = await this.lit.decrypt(
          decodedData["encryptedData"],
          decodedData["hash"],
          JSON.parse(decodedData["conditions"]),
          options.resources
        )
        return { decodedData: JSON.parse(decryptedResult), attestation }
      }

      return { decodedData, attestation }
    } else {
      throw new Error("Data is invalid")
    }
  }

  async revokeAttestation(attestationId: string, options: any) {
    throw new Error("Not implemented")
  }
}
