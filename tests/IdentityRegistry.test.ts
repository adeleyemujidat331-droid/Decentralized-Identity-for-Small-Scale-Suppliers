import { describe, it, expect, beforeEach } from "vitest";
import { stringUtf8CV, uintCV, buffCV, optionalCV } from "@stacks/transactions";

const ERR_ALREADY_REGISTERED = 100;
const ERR_INVALID_HASH = 101;
const ERR_INVALID_PRINCIPAL = 102;
const ERR_NOT_AUTHORIZED = 103;
const ERR_INVALID_TIMESTAMP = 104;
const ERR_ID_NOT_FOUND = 105;
const ERR_HASH_ALREADY_USED = 106;
const ERR_INVALID_PROOF = 107;
const ERR_INVALID_LOCATION = 108;
const ERR_INVALID_CATEGORY = 109;
const ERR_INVALID_STATUS = 110;
const ERR_INVALID_UPDATE = 111;
const ERR_MAX_IDS_EXCEEDED = 112;
const ERR_INVALID_MIN_AGE = 113;
const ERR_INVALID_VERIFIER = 114;
const ERR_VERIFICATION_FAILED = 115;
const ERR_INVALID_BIOMETRIC = 116;
const ERR_INVALID_EMAIL = 117;
const ERR_INVALID_PHONE = 118;
const ERR_INVALID_NAME = 119;
const ERR_INVALID_ADDRESS = 120;

interface Identity {
  owner: string;
  idHash: Uint8Array;
  registeredAt: number;
  lastUpdated: number;
  proof: Uint8Array;
  location: string;
  category: string;
  status: boolean;
  age: number;
  biometricHash: Uint8Array | null;
  email: string | null;
  phone: string | null;
  name: string;
  address: string;
}

interface IdentityUpdate {
  updateHash: Uint8Array;
  updateTimestamp: number;
  updater: string;
  updateProof: Uint8Array;
}

interface Result<T> {
  ok: boolean;
  value: T;
}

class IdentityRegistryMock {
  state: {
    registryAdmin: string;
    nextId: number;
    maxIds: number;
    registrationFee: number;
    verifierContract: string | null;
    identities: Map<number, Identity>;
    identitiesByHash: Map<string, number>;
    identitiesByOwner: Map<string, number>;
    identityUpdates: Map<number, IdentityUpdate>;
  } = {
    registryAdmin: "ST1TEST",
    nextId: 0,
    maxIds: 1000000,
    registrationFee: 500,
    verifierContract: null,
    identities: new Map(),
    identitiesByHash: new Map(),
    identitiesByOwner: new Map(),
    identityUpdates: new Map(),
  };
  blockHeight: number = 0;
  caller: string = "ST1TEST";
  stxTransfers: Array<{ amount: number; from: string; to: string }> = [];

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      registryAdmin: "ST1TEST",
      nextId: 0,
      maxIds: 1000000,
      registrationFee: 500,
      verifierContract: null,
      identities: new Map(),
      identitiesByHash: new Map(),
      identitiesByOwner: new Map(),
      identityUpdates: new Map(),
    };
    this.blockHeight = 0;
    this.caller = "ST1TEST";
    this.stxTransfers = [];
  }

  setVerifierContract(contractPrincipal: string): Result<boolean> {
    if (this.caller !== this.state.registryAdmin) return { ok: false, value: ERR_NOT_AUTHORIZED };
    this.state.verifierContract = contractPrincipal;
    return { ok: true, value: true };
  }

  setMaxIds(newMax: number): Result<boolean> {
    if (this.caller !== this.state.registryAdmin) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (newMax <= 0) return { ok: false, value: ERR_MAX_IDS_EXCEEDED };
    this.state.maxIds = newMax;
    return { ok: true, value: true };
  }

  setRegistrationFee(newFee: number): Result<boolean> {
    if (this.caller !== this.state.registryAdmin) return { ok: false, value: ERR_NOT_AUTHORIZED };
    this.state.registrationFee = newFee;
    return { ok: true, value: true };
  }

  registerIdentity(
    idHash: Uint8Array,
    proof: Uint8Array,
    location: string,
    category: string,
    age: number,
    biometricHash: Uint8Array | null,
    email: string | null,
    phone: string | null,
    name: string,
    address: string
  ): Result<number> {
    if (this.state.nextId >= this.state.maxIds) return { ok: false, value: ERR_MAX_IDS_EXCEEDED };
    if (idHash.length !== 32) return { ok: false, value: ERR_INVALID_HASH };
    if (proof.length !== 64) return { ok: false, value: ERR_INVALID_PROOF };
    if (location.length === 0 || location.length > 100) return { ok: false, value: ERR_INVALID_LOCATION };
    if (!["farmer", "artisan", "supplier"].includes(category)) return { ok: false, value: ERR_INVALID_CATEGORY };
    if (age < 18) return { ok: false, value: ERR_INVALID_MIN_AGE };
    if (biometricHash && biometricHash.length !== 32) return { ok: false, value: ERR_INVALID_BIOMETRIC };
    if (email && email.length > 100) return { ok: false, value: ERR_INVALID_EMAIL };
    if (phone && phone.length > 50) return { ok: false, value: ERR_INVALID_PHONE };
    if (name.length === 0 || name.length > 100) return { ok: false, value: ERR_INVALID_NAME };
    if (address.length > 200) return { ok: false, value: ERR_INVALID_ADDRESS };
    const hashKey = idHash.toString();
    if (this.state.identitiesByHash.has(hashKey)) return { ok: false, value: ERR_HASH_ALREADY_USED };
    if (this.state.identitiesByOwner.has(this.caller)) return { ok: false, value: ERR_ALREADY_REGISTERED };
    if (this.state.verifierContract === null) return { ok: false, value: ERR_VERIFICATION_FAILED };

    this.stxTransfers.push({ amount: this.state.registrationFee, from: this.caller, to: this.state.registryAdmin });

    const id = this.state.nextId;
    const identity: Identity = {
      owner: this.caller,
      idHash,
      registeredAt: this.blockHeight,
      lastUpdated: this.blockHeight,
      proof,
      location,
      category,
      status: true,
      age,
      biometricHash,
      email,
      phone,
      name,
      address,
    };
    this.state.identities.set(id, identity);
    this.state.identitiesByHash.set(hashKey, id);
    this.state.identitiesByOwner.set(this.caller, id);
    this.state.nextId++;
    return { ok: true, value: id };
  }

  getIdentity(id: number): Identity | null {
    return this.state.identities.get(id) || null;
  }

  updateIdentity(id: number, newHash: Uint8Array, newProof: Uint8Array): Result<boolean> {
    const identity = this.state.identities.get(id);
    if (!identity) return { ok: false, value: ERR_ID_NOT_FOUND };
    if (identity.owner !== this.caller) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (newHash.length !== 32) return { ok: false, value: ERR_INVALID_HASH };
    if (newProof.length !== 64) return { ok: false, value: ERR_INVALID_PROOF };
    const newHashKey = newHash.toString();
    if (this.state.identitiesByHash.has(newHashKey)) return { ok: false, value: ERR_HASH_ALREADY_USED };

    const updated: Identity = {
      ...identity,
      idHash: newHash,
      lastUpdated: this.blockHeight,
      proof: newProof,
    };
    this.state.identities.set(id, updated);
    this.state.identitiesByHash.delete(identity.idHash.toString());
    this.state.identitiesByHash.set(newHashKey, id);
    this.state.identityUpdates.set(id, {
      updateHash: newHash,
      updateTimestamp: this.blockHeight,
      updater: this.caller,
      updateProof: newProof,
    });
    return { ok: true, value: true };
  }

  deactivateIdentity(id: number): Result<boolean> {
    const identity = this.state.identities.get(id);
    if (!identity) return { ok: false, value: ERR_ID_NOT_FOUND };
    if (identity.owner !== this.caller) return { ok: false, value: ERR_NOT_AUTHORIZED };
    const updated: Identity = { ...identity, status: false };
    this.state.identities.set(id, updated);
    return { ok: true, value: true };
  }

  getIdentityCount(): Result<number> {
    return { ok: true, value: this.state.nextId };
  }

  checkIdentityExistence(hash: Uint8Array): Result<boolean> {
    return { ok: true, value: this.state.identitiesByHash.has(hash.toString()) };
  }
}

describe("IdentityRegistry", () => {
  let contract: IdentityRegistryMock;

  beforeEach(() => {
    contract = new IdentityRegistryMock();
    contract.reset();
  });

  it("registers an identity successfully", () => {
    contract.setVerifierContract("ST2TEST");
    const idHash = new Uint8Array(32).fill(1);
    const proof = new Uint8Array(64).fill(2);
    const biometricHash = new Uint8Array(32).fill(3);
    const result = contract.registerIdentity(
      idHash,
      proof,
      "LocationX",
      "farmer",
      25,
      biometricHash,
      "test@email.com",
      "1234567890",
      "John Doe",
      "123 Street"
    );
    expect(result.ok).toBe(true);
    expect(result.value).toBe(0);

    const identity = contract.getIdentity(0);
    expect(identity?.owner).toBe("ST1TEST");
    expect(identity?.idHash).toEqual(idHash);
    expect(identity?.location).toBe("LocationX");
    expect(identity?.category).toBe("farmer");
    expect(identity?.age).toBe(25);
    expect(identity?.biometricHash).toEqual(biometricHash);
    expect(identity?.email).toBe("test@email.com");
    expect(identity?.phone).toBe("1234567890");
    expect(identity?.name).toBe("John Doe");
    expect(identity?.address).toBe("123 Street");
    expect(contract.stxTransfers).toEqual([{ amount: 500, from: "ST1TEST", to: "ST1TEST" }]);
  });

  it("rejects duplicate hash", () => {
    contract.setVerifierContract("ST2TEST");
    const idHash = new Uint8Array(32).fill(1);
    const proof = new Uint8Array(64).fill(2);
    contract.registerIdentity(
      idHash,
      proof,
      "LocationX",
      "farmer",
      25,
      null,
      null,
      null,
      "John Doe",
      "123 Street"
    );
    const result = contract.registerIdentity(
      idHash,
      proof,
      "LocationY",
      "artisan",
      30,
      null,
      null,
      null,
      "Jane Doe",
      "456 Avenue"
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_HASH_ALREADY_USED);
  });

  it("rejects registration without verifier", () => {
    const idHash = new Uint8Array(32).fill(1);
    const proof = new Uint8Array(64).fill(2);
    const result = contract.registerIdentity(
      idHash,
      proof,
      "LocationX",
      "farmer",
      25,
      null,
      null,
      null,
      "John Doe",
      "123 Street"
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_VERIFICATION_FAILED);
  });

  it("rejects invalid hash length", () => {
    contract.setVerifierContract("ST2TEST");
    const idHash = new Uint8Array(31).fill(1);
    const proof = new Uint8Array(64).fill(2);
    const result = contract.registerIdentity(
      idHash,
      proof,
      "LocationX",
      "farmer",
      25,
      null,
      null,
      null,
      "John Doe",
      "123 Street"
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_HASH);
  });

  it("rejects underage", () => {
    contract.setVerifierContract("ST2TEST");
    const idHash = new Uint8Array(32).fill(1);
    const proof = new Uint8Array(64).fill(2);
    const result = contract.registerIdentity(
      idHash,
      proof,
      "LocationX",
      "farmer",
      17,
      null,
      null,
      null,
      "John Doe",
      "123 Street"
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_MIN_AGE);
  });

  it("updates identity successfully", () => {
    contract.setVerifierContract("ST2TEST");
    const idHash = new Uint8Array(32).fill(1);
    const proof = new Uint8Array(64).fill(2);
    contract.registerIdentity(
      idHash,
      proof,
      "LocationX",
      "farmer",
      25,
      null,
      null,
      null,
      "John Doe",
      "123 Street"
    );
    const newHash = new Uint8Array(32).fill(3);
    const newProof = new Uint8Array(64).fill(4);
    const result = contract.updateIdentity(0, newHash, newProof);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const identity = contract.getIdentity(0);
    expect(identity?.idHash).toEqual(newHash);
    expect(identity?.proof).toEqual(newProof);
    const update = contract.state.identityUpdates.get(0);
    expect(update?.updateHash).toEqual(newHash);
    expect(update?.updater).toBe("ST1TEST");
  });

  it("rejects update for non-existent id", () => {
    const newHash = new Uint8Array(32).fill(3);
    const newProof = new Uint8Array(64).fill(4);
    const result = contract.updateIdentity(99, newHash, newProof);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_ID_NOT_FOUND);
  });

  it("rejects update by non-owner", () => {
    contract.setVerifierContract("ST2TEST");
    const idHash = new Uint8Array(32).fill(1);
    const proof = new Uint8Array(64).fill(2);
    contract.registerIdentity(
      idHash,
      proof,
      "LocationX",
      "farmer",
      25,
      null,
      null,
      null,
      "John Doe",
      "123 Street"
    );
    contract.caller = "ST3FAKE";
    const newHash = new Uint8Array(32).fill(3);
    const newProof = new Uint8Array(64).fill(4);
    const result = contract.updateIdentity(0, newHash, newProof);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("deactivates identity successfully", () => {
    contract.setVerifierContract("ST2TEST");
    const idHash = new Uint8Array(32).fill(1);
    const proof = new Uint8Array(64).fill(2);
    contract.registerIdentity(
      idHash,
      proof,
      "LocationX",
      "farmer",
      25,
      null,
      null,
      null,
      "John Doe",
      "123 Street"
    );
    const result = contract.deactivateIdentity(0);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const identity = contract.getIdentity(0);
    expect(identity?.status).toBe(false);
  });

  it("sets registration fee successfully", () => {
    const result = contract.setRegistrationFee(1000);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.registrationFee).toBe(1000);
  });

  it("rejects fee change by non-admin", () => {
    contract.caller = "ST3FAKE";
    const result = contract.setRegistrationFee(1000);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("checks identity existence correctly", () => {
    contract.setVerifierContract("ST2TEST");
    const idHash = new Uint8Array(32).fill(1);
    const proof = new Uint8Array(64).fill(2);
    contract.registerIdentity(
      idHash,
      proof,
      "LocationX",
      "farmer",
      25,
      null,
      null,
      null,
      "John Doe",
      "123 Street"
    );
    const result = contract.checkIdentityExistence(idHash);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const fakeHash = new Uint8Array(32).fill(5);
    const result2 = contract.checkIdentityExistence(fakeHash);
    expect(result2.ok).toBe(true);
    expect(result2.value).toBe(false);
  });

  it("rejects registration with max ids exceeded", () => {
    contract.setVerifierContract("ST2TEST");
    contract.setMaxIds(1);
    const idHash1 = new Uint8Array(32).fill(1);
    const proof1 = new Uint8Array(64).fill(2);
    contract.registerIdentity(
      idHash1,
      proof1,
      "LocationX",
      "farmer",
      25,
      null,
      null,
      null,
      "John Doe",
      "123 Street"
    );
    const idHash2 = new Uint8Array(32).fill(3);
    const proof2 = new Uint8Array(64).fill(4);
    const result = contract.registerIdentity(
      idHash2,
      proof2,
      "LocationY",
      "artisan",
      30,
      null,
      null,
      null,
      "Jane Doe",
      "456 Avenue"
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_MAX_IDS_EXCEEDED);
  });

  it("sets verifier contract successfully", () => {
    const result = contract.setVerifierContract("ST2TEST");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.verifierContract).toBe("ST2TEST");
  });
});