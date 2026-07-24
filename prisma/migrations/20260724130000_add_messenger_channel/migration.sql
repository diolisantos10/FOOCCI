-- Facebook Messenger as a first-class conversation channel (Page DMs → Central).
ALTER TYPE "Channel" ADD VALUE IF NOT EXISTS 'MESSENGER';
