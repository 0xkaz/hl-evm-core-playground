// CoreWriter — encode actions for the system contract at 0x333...333.
//
// Encoding: byte 0 = version (1), bytes 1-3 = big-endian action ID,
// remaining = raw ABI encoding of the action fields.
//
// This module is ENCODE-ONLY. Sending is done separately (demo-corewriter.ts)
// and requires a funded testnet key — never commit secrets.

import { encodeAbiParameters, parseAbiParameters, concat, toHex, type Hex } from "viem";

export const CORE_WRITER = "0x3333333333333333333333333333333333333333" as const;

export const VERSION = 1;

export const ACTION = {
  limitOrder: 1,
  vaultTransfer: 2,
  tokenDelegate: 3,
  stakingDeposit: 4,
  stakingWithdraw: 5,
  spotSend: 6,
  usdClassTransfer: 7,
  finalizeEvmContract: 8,
  addApiWallet: 9,
  cancelOrderByOid: 10,
  cancelOrderByCloid: 11,
  approveBuilderFee: 12,
  sendAsset: 13,
  reflectEvmSupplyChange: 14,
  borrowLend: 15,
} as const;

// version byte + 3-byte big-endian action id + ABI body
export function encodeAction(actionId: number, body: Hex): Hex {
  const header = toHex(
    Uint8Array.from([
      VERSION,
      (actionId >> 16) & 0xff,
      (actionId >> 8) & 0xff,
      actionId & 0xff,
    ]),
  );
  return concat([header, body]);
}

// limitPx and sz are 1e8 * the human-readable value. tif: 1=Alo 2=Gtc 3=Ioc.
export function encodeLimitOrder(args: {
  asset: number;
  isBuy: boolean;
  limitPx: bigint;
  sz: bigint;
  reduceOnly: boolean;
  tif: number;
  cloid: bigint;
}): Hex {
  const body = encodeAbiParameters(
    parseAbiParameters("uint32, bool, uint64, uint64, bool, uint8, uint128"),
    [args.asset, args.isBuy, args.limitPx, args.sz, args.reduceOnly, args.tif, args.cloid],
  );
  return encodeAction(ACTION.limitOrder, body);
}

export function encodeSpotSend(destination: Hex, token: bigint, weiAmount: bigint): Hex {
  const body = encodeAbiParameters(parseAbiParameters("address, uint64, uint64"), [
    destination,
    token,
    weiAmount,
  ]);
  return encodeAction(ACTION.spotSend, body);
}

export function encodeUsdClassTransfer(ntl: bigint, toPerp: boolean): Hex {
  const body = encodeAbiParameters(parseAbiParameters("uint64, bool"), [ntl, toPerp]);
  return encodeAction(ACTION.usdClassTransfer, body);
}

export function encodeVaultTransfer(vault: Hex, isDeposit: boolean, usd: bigint): Hex {
  const body = encodeAbiParameters(parseAbiParameters("address, bool, uint64"), [
    vault,
    isDeposit,
    usd,
  ]);
  return encodeAction(ACTION.vaultTransfer, body);
}

export function encodeCancelOrderByOid(asset: number, oid: bigint): Hex {
  const body = encodeAbiParameters(parseAbiParameters("uint32, uint64"), [asset, oid]);
  return encodeAction(ACTION.cancelOrderByOid, body);
}
