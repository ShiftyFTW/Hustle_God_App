'use client';

import { useState } from 'react';
import { Key, ExternalLink, Check, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const API_DOCS = [
  {
    key: 'OPENAI_API_KEY',
    label: 'OpenAI API Key',
    description: 'Used for all AI agents: identification, condition, comp research, and listing generation.',
    docUrl: 'https://platform.openai.com/api-keys',
    required: true,
  },
  {
    key: 'EBAY_OAUTH_TOKEN',
    label: 'eBay OAuth Token',
    description: 'Required for publishing listings to eBay via the Sell API. Generate from eBay Developer portal.',
    docUrl: 'https://developer.ebay.com',
    required: true,
  },
];

export default function SettingsPage() {
  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configure API keys and integrations.
        </p>
      </div>

      <div className="space-y-4">
        <div className="bg-amber-900/20 border border-amber-500/30 rounded-xl p-4">
          <p className="text-sm font-medium text-amber-300 flex items-center gap-2 mb-2">
            <AlertCircle className="w-4 h-4" />
            How to configure API keys
          </p>
          <p className="text-xs text-amber-400/80 leading-relaxed">
            API keys are configured as environment secrets in your deployment environment.
            In Bolt/Netlify, add them as environment variables. They are never stored in the database or exposed to the frontend.
          </p>
        </div>

        {API_DOCS.map(({ key, label, description, docUrl, required }) => (
          <div key={key} className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                <Key className="w-4 h-4 text-primary" />
                <p className="font-semibold text-foreground text-sm">{label}</p>
                {required && (
                  <span className="text-[10px] bg-red-900/50 text-red-300 px-1.5 py-0.5 rounded">Required</span>
                )}
              </div>
              <a
                href={docUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
              >
                Get key <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <p className="text-xs text-muted-foreground mb-3 leading-relaxed">{description}</p>
            <div className="bg-secondary/50 rounded-lg px-3 py-2">
              <code className="text-xs text-primary font-mono">{key}</code>
            </div>
          </div>
        ))}

        <div className="bg-card border border-border rounded-xl p-5">
          <p className="font-semibold text-foreground text-sm mb-3">eBay Fulfillment Policy IDs</p>
          <p className="text-xs text-muted-foreground leading-relaxed mb-3">
            When publishing to eBay, you need fulfillment, payment, and return policy IDs.
            Get these from your eBay Seller Hub → Account → Business Policies.
            Pass them in the publish request body or set as env vars:
          </p>
          <div className="space-y-2">
            {['EBAY_FULFILLMENT_POLICY_ID', 'EBAY_PAYMENT_POLICY_ID', 'EBAY_RETURN_POLICY_ID', 'EBAY_MERCHANT_LOCATION_KEY'].map((k) => (
              <div key={k} className="bg-secondary/50 rounded-lg px-3 py-2">
                <code className="text-xs text-primary font-mono">{k}</code>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
