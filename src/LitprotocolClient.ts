import {
  LitAccessControlConditionResource,
  createSiweMessageWithRecaps,
  generateAuthSig,
} from "@lit-protocol/auth-helpers"
import { LitNetwork } from "@lit-protocol/constants"
import {
  LitNodeClient,
  LitNodeClientNodeJs,
  //   checkAndSignAuthMessage,
} from "@lit-protocol/lit-node-client"
import {
  AccsDefaultParams,
  LitAbility,
  UnifiedAccessControlConditions,
} from "@lit-protocol/types"
import { uint8arrayToString } from "@lit-protocol/uint8arrays"
import { ethers } from "ethers"

export class LitProtocol {
  client: LitNodeClient | LitNodeClientNodeJs
  litNetwork: LitNetwork = LitNetwork.DatilDev
  chain: string = "sepolia"
  private readonly ethereumAuthWallet: ethers.Wallet

  constructor(ethereumAuthWallet: ethers.Wallet) {
    this.ethereumAuthWallet = ethereumAuthWallet
    this.client = new LitNodeClientNodeJs({
      litNetwork: LitNetwork.DatilDev,
      debug: false,
    })
  }

  async connect(): Promise<void> {
    return await this.client.connect()
  }

  static async create(ethereumWallet: ethers.Wallet): Promise<LitProtocol> {
    const litProtocol = new LitProtocol(ethereumWallet)
    await litProtocol.connect()
    return litProtocol
  }

  async encrypt(
    data: Uint8Array,
    unifiedAccessControlConditions?: NonNullable<UnifiedAccessControlConditions>
  ) {
    const { ciphertext: encryptedString, dataToEncryptHash: stringHash } =
      await this.client.encrypt({
        dataToEncrypt: data,
        unifiedAccessControlConditions: unifiedAccessControlConditions || [
          LitProtocol.generateAccessControlConditionBalance(),
        ],
      })

    return {
      encryptedString,
      stringHash,
    }
  }

  async decrypt(
    encryptedString: string,
    stringHash: string,
    unifiedAccessControlConditions: NonNullable<UnifiedAccessControlConditions>,
    chain: string,
    _resources: string[] = []
  ): Promise<string> {
    const resourceAbilityRequests = [
      {
        resource: new LitAccessControlConditionResource("*"),
        ability: LitAbility.AccessControlConditionDecryption,
      },
    ]

    // generate session signatures
    const sessionSigs = await this.client.getSessionSigs({
      expiration: new Date(Date.now() + 1000 * 60 * 10).toISOString(),
      resourceAbilityRequests,
      // TODO: Debug including custom params in a smart contract
      //   jsParams: resources.length
      //     ? {
      //         authsig: await checkAndSignAuthMessage({
      //           chain: this.chain,
      //           resources: resources,
      //           nonce: await this.client.getLatestBlockhash(),
      //         }),
      //       }
      //     : undefined,
      authNeededCallback: async ({
        uri,
        expiration,
        resourceAbilityRequests,
      }: any) => {
        const toSign = await createSiweMessageWithRecaps({
          uri,
          expiration,
          resources: resourceAbilityRequests,
          walletAddress: await this.ethereumAuthWallet.getAddress(),
          nonce: await this.client.getLatestBlockhash(),
          litNodeClient: this.client,
        })

        return await generateAuthSig({
          signer: this.ethereumAuthWallet,
          toSign,
        })
      },
    })

    // decrypt
    const { decryptedData } = await this.client.decrypt({
      chain,
      ciphertext: encryptedString,
      dataToEncryptHash: stringHash,
      unifiedAccessControlConditions: unifiedAccessControlConditions,
      sessionSigs,
    })

    return uint8arrayToString(decryptedData)
  }

  static generateAccessControlConditionBalance(
    address = ":userAddress"
  ): AccsDefaultParams {
    return {
      contractAddress: "",
      standardContractType: "",
      conditionType: "evmBasic",
      chain: "amoy",
      method: "eth_getBalance",
      parameters: [":userAddress"],
      returnValueTest: {
        comparator: ">=",
        value: "0",
      },
    }
  }
}
