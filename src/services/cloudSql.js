import mysql from "mysql2/promise";
import { Connector, IpAddressTypes, AuthTypes } from "@google-cloud/cloud-sql-connector";

let cmsPool;
let portalPool;

export async function getCmsPool() {
  if (cmsPool) return cmsPool;
  if ((process.env.CMS_DATABASE_PROVIDER || "local") !== "gcp") return null;

  const connector = new Connector();
  const options = await connector.getOptions({
    instanceConnectionName: process.env.CMS_CLOUD_SQL_INSTANCE || process.env.INSTANCE_CONNECTION_NAME,
    ipType: process.env.PRIVATE_IP === "true" ? IpAddressTypes.PRIVATE : IpAddressTypes.PUBLIC,
    authType: process.env.CMS_IAM_AUTH === "true" ? AuthTypes.IAM : AuthTypes.PASSWORD,
  });

  cmsPool = mysql.createPool({
    ...options,
    user: process.env.CMS_DB_USER || process.env.DB_USER,
    password: process.env.CMS_DB_PASSWORD || process.env.DB_PASS,
    database: process.env.CMS_DB_NAME || process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 5,
  });

  return cmsPool;
}

export async function getPortalPool() {
  if (portalPool) return portalPool;
  if ((process.env.PORTAL_DATABASE_PROVIDER || process.env.USER_DATABASE_PROVIDER || "local") !== "gcp") return null;

  const connector = new Connector();
  const options = await connector.getOptions({
    instanceConnectionName: process.env.PORTAL_CLOUD_SQL_INSTANCE || process.env.INSTANCE_CONNECTION_NAME,
    ipType: process.env.PRIVATE_IP === "true" ? IpAddressTypes.PRIVATE : IpAddressTypes.PUBLIC,
    authType: process.env.PORTAL_IAM_AUTH === "true" ? AuthTypes.IAM : AuthTypes.PASSWORD,
  });

  portalPool = mysql.createPool({
    ...options,
    user: process.env.PORTAL_DB_USER || process.env.USER_DB_USER,
    password: process.env.PORTAL_DB_PASSWORD || process.env.USER_DB_PASS,
    database: process.env.PORTAL_DB_NAME || process.env.USER_DB_NAME,
    waitForConnections: true,
    connectionLimit: 5,
  });

  return portalPool;
}
