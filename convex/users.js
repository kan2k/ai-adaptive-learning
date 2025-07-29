import { mutation, query, internalQuery } from "./_generated/server";
import { v } from "convex/values";

export const store = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Called storeUser without authentication present");
    }

    // Check if we've already stored this identity before.
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier),
      )
      .unique();
    if (user !== null) {
      // If we've seen this identity before but have no user, create one.
      return user._id;
    }
    // If it's a new identity, create a new user.
    const userId = await ctx.db.insert("users", {
      tokenIdentifier: identity.tokenIdentifier,
      preferences: {
        languageComplexity: "High School",
        analogyUsage: "Occasional",
        wordLength: "Medium",
      },
    });
    return userId;
  },
});

export const getPreferences = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Called getPreferences without authentication present");
    }
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier),
      )
      .unique();
    if (user === null) {
      return null;
    }
    return user.preferences;
  },
});

export const savePreferences = mutation({
  args: {
    preferences: v.object({
      languageComplexity: v.string(),
      analogyUsage: v.string(),
      wordLength: v.string(),
    }),
  },
  handler: async (ctx, { preferences }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier),
      )
      .unique();

    if (!user) {
      await ctx.db.insert("users", {
        tokenIdentifier: identity.tokenIdentifier,
        // This is a guess, the original file may have more fields
        name: identity.name,
        email: identity.email,
        profileUrl: identity.profileUrl,
        preferences: preferences,
      });
    } else {
      await ctx.db.patch(user._id, {
        preferences: preferences,
      });
    }
  },
});

export const internalGetUserByTokenIdentifier = internalQuery({
  args: {
    tokenIdentifier: v.string(),
  },
  handler: async (ctx, { tokenIdentifier }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", tokenIdentifier))
      .unique();
    return user;
  },
});
