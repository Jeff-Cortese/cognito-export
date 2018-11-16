import { CognitoIdentityServiceProvider, DynamoDB } from 'aws-sdk';
import { uniq } from 'lodash';
import * as meow from 'meow';
import * as jsonfile from 'jsonfile';
import * as moniker from 'moniker';
import * as fs from 'fs';

const cli = meow(`
    Usage
      $ npm start -- export <options>  
      
      AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
      can be specified in env variables or ~/.aws/credentials
    Options
      --region AWS region
      --stage stage moniker (ex prod, dev, PR123)
`);

const accessKeyId = process.env.AWS_ACCESS_ID;
const secretAccessKey = process.env.AWS_SECRET_KEY;
const sessionToken = process.env.AWS_SESSION_TOKEN;
const { stage, region } = cli.flags;
const awsConfig = {
  region,
  accessKeyId,
  secretAccessKey,
  sessionToken
};
const dynamo = new DynamoDB(awsConfig);
const cognito = new CognitoIdentityServiceProvider(awsConfig);
const names = moniker.generator([moniker.adjective, moniker.noun]);

const exportUsers = async (memberTableName: string, tenantTableName: string, domainTableName: string) => {
  console.log(`Fetching all items from table ${memberTableName}...`);
  const memberItems = await getAllItems(memberTableName);
  const distinctPoolIds = uniq(memberItems.map(item => item.authPoolId.S));
  console.log(`Found ${memberItems.length} items in table ${memberTableName} referencing ${distinctPoolIds.length} unique pools.`);

  let pools = [];
  let missingPools = [];
  for (const poolId of distinctPoolIds) {
    let poolName = '';
    try {
      const { UserPool: pool } = await cognito.describeUserPool({ UserPoolId: poolId }).promise();
      poolName = pool.Name;
    } catch (error) {
      if (error.name === 'ResourceNotFoundException') {
        missingPools.push(poolId);
        continue;
      }
    }

    console.log(`Fetching all users from pool ${poolName} (${poolId})...`);
    try {
      const poolUsers = await getAllUsers(poolId);
      console.log(`Found ${poolUsers.length} users in pool ${poolName}.`);
      pools = [...pools, { poolId, poolName, users: poolUsers.map(scrubPoolUser) }];
      console.log(`Scrubbed user names and emails for pool ${poolName}`);
    } catch (error) {
      console.error(`Error getting users from pool ${poolId}`);
      console.error(error);
    }
  }

  if (missingPools.length) {
    console.log(`There are members referencing ${missingPools.length} missing cognito pools.`);
  }

  console.log(`Fetching all items in table ${tenantTableName}...`);
  const tenants = await getAllItems(tenantTableName);
  console.log(`Found ${tenantTableName.length} tenants in table ${tenantTableName}`);

  console.log(`Fetching all items in table ${domainTableName}...`);
  const domains = await getAllItems(domainTableName);
  console.log(`Found ${domains.length} domains in table ${domainTableName}`);

  const dataFolder = './data';
  const dataSubfolder = `${dataFolder}/${stage}_${region}`;
  if (!fs.existsSync(dataFolder)) {
    fs.mkdirSync(dataFolder);
  }
  if (!fs.existsSync(dataSubfolder)) {
    fs.mkdirSync(dataSubfolder);
  }

  console.log(`Writing data to files at ./data/${dataSubfolder}`);
  jsonfile.writeFileSync(`${dataSubfolder}/members.json`, memberItems.map(scrubMember), { spaces: 2 });
  jsonfile.writeFileSync(`${dataSubfolder}/pools.json`, pools, { spaces: 2 });
  jsonfile.writeFileSync(`${dataSubfolder}/tenants.json`, tenants, { spaces: 2 });
  jsonfile.writeFileSync(`${dataSubfolder}/domains.json`, domains, { spaces: 2 });
  jsonfile.writeFileSync(`${dataSubfolder}/missingPools.json`, missingPools, { spaces: 2 });
  console.log(`Data wrote to ${dataSubfolder}`);
};

const scrubPoolUser = (user) => {
  const oldEmail = (user.Attributes.find(attr => attr.Name === 'email') || { Name: 'email', Value: '' }).Value;
  if (oldEmail.endsWith('cleo.com') || oldEmail.endsWith('mailosaur.io')) {
    return user;
  }

  const domain = oldEmail.substring(oldEmail.indexOf('@'));
  const name: string = names.choose();
  const first = name.split('-')[0];
  const last = name.split('-')[1];
  const newEmail = `${name.replace('-', '.')}${domain}`;
  return {
    ...user,
    Attributes: user.Attributes
      .filter(attr => !['given_name', 'family_name', 'preferred_name', 'email'].includes(attr.Name))
      .concat([
        { Name: 'email', Value: newEmail },
        { Name: 'given_name', Value: first },
        { Name: 'family_name', Value: last }
      ])
  };
};

const scrubMember = (member) => {
  const domain = member.email.S.substring(member.email.S.indexOf('@'));
  if (domain.endsWith('cleo.com') || domain.endsWith('mailosaur.io')) {
    return member;
  }

  return {
    ...member,
    email: { S: `${names.choose()}${domain}` }
  };
};

const getAllItems = async (tableName: string, accumedMembers = [], startKey?): Promise<DynamoDB.AttributeMap[]> => {
  const { Items: items, LastEvaluatedKey: lastKey } =
    await dynamo.scan({ TableName: tableName, ExclusiveStartKey: startKey }).promise();

  if (lastKey) {
    return getAllItems(tableName, [...accumedMembers, ...items], lastKey);
  }

  return [...accumedMembers, ...items];
};

const getAllUsers = async (poolId: string, accumedUsers = [], pageToken?: string): Promise<any[]> => {
  const params = {
    AttributesToGet: [
      'given_name',
      'family_name',
      'custom:company',
      'custom:title',
      'email'
    ],
    UserPoolId: poolId
  };
  const { Users: cognitoUsers, PaginationToken: nextPageToken } = await cognito.listUsers({ ...params, PaginationToken: pageToken }).promise();

  if (nextPageToken) {
    return getAllUsers(poolId, [...accumedUsers, ...cognitoUsers], nextPageToken);
  }

  return [...accumedUsers, ...cognitoUsers];
};

(async () => {
  try {
    const memberTable = `crowsnest-authv3-${stage}.Member`;
    const tenantTable = `crowsnest-authv3-${stage}.Tenant`;
    const domainTable = `crowsnest-authv3-${stage}.Domain`;

    switch (cli.input[0]) {
      case 'export':
        return await exportUsers(memberTable, tenantTable, domainTable);
      default:
        return cli.showHelp();
    }
  } catch (error) {
    console.log('Unhandled Error');
    console.error(error);
  }
})();