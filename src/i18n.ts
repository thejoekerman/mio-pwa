import { computed, shallowReactive } from 'vue'
import { useSettings } from './composables/useSettings'
import { APP_LANGUAGES } from './types'
import type { AppLanguage, GameDisplayStatus, GameOwnershipFilter, GameOwnershipType, GameSortOption } from './types'

/**
 * Extract all nested keys from an object as dot-notation strings.
 * Example: { nav: { home: 'Home' } } → 'nav.home'
 */
type NestedKeyOf<T> = {
  [K in keyof T & string]: T[K] extends Record<string, unknown>
    ? `${K}.${NestedKeyOf<T[K]>}`
    : K
}[keyof T & string]

const en = {
    nav: {
      home: 'Home',
      library: 'Library',
      add: 'Add',
      primary: 'Primary',
      settings: 'Settings',
      homeLabel: 'MioLog home',
      statsLabel: 'Stats overview',
    },
    app: {
      title: 'MioLog',
      demoBadge: 'Demo',
      updateAvailable: 'A new version is available.',
      updateReload: 'Reload',
      openingJournal: 'Opening your journal...',
      installPrompt: 'Add MioLog to your home screen?',
      installAction: 'Install',
      installDismiss: 'Dismiss install prompt',
    },
    status: {
      backlog: 'Backlog',
      playing: 'Playing',
      ongoing: 'Ongoing',
      finished: 'Finished',
      replaying: 'Replaying',
      paused: 'Paused',
      abandoned: 'Abandoned',
      all: 'All statuses',
    },
    sort: {
      'created-desc': 'Added newest',
      'created-asc': 'Added oldest',
      'finished-desc': 'Finished newest',
      'finished-asc': 'Finished oldest',
      'title-asc': 'Title A-Z',
      'developer-asc': 'Developer A-Z',
      'publisher-asc': 'Publisher A-Z',
      'rating-desc': 'Rating high-low',
      'rating-asc': 'Rating low-high',
    },
    ownership: {
      all: 'All formats',
      digital: 'Digital',
      physical: 'Physical',
      both: 'Digital + physical',
      unset: 'Not set',
    },
    priority: {
      'high-interest': 'High interest',
      'low-pressure': 'Low pressure',
      'save-for-later': 'Save for later',
    },
    hero: {
      eyebrow: 'Mio-chan\'s notebook',
      title: 'Your journal',
      lede:
        'Mio-chan has been quietly keeping tabs — here\'s everything she knows about your backlog right now.',
      totalGames: 'Total games',
      currentlyPlaying: 'Currently playing',
      ongoing: 'Ongoing',
      finished: 'Finished',
      playLogs: 'Play logs',
    },
    statsView: {
      kicker: 'Stats',
      title: 'Your MioLog',
      body: 'Mio-chan has been quietly keeping tabs on your gaming journal.',
      library: 'Library',
      playHistory: 'Play history',
      rightNow: 'Right now',
      games: 'Games',
      journeys: 'Journeys',
      finishedJourneys: 'Finished journeys',
      finishedGames: 'Finished games',
      backlogGames: 'Backlog games',
      completedReplays: 'Completed replays',
      playTime: 'Playtime',
      averageRating: 'Average rating',
      reviews: 'Reviews',
      playLogs: 'Play logs',
      activeJourneys: 'Active journeys',
      activeGames: 'Active games',
      backlogJourneys: 'Backlog journeys',
      pausedJourneys: 'Paused journeys',
      finishedThisYear: 'Finished this year',
      topPlatform: 'Top platform',
      libraryShape: 'Library shape',
      libraryShapeHint: 'How your games are distributed right now.',
      backlogMovement: 'Backlog movement',
      backlogMovementHint: 'Games added compared with journeys finished each month.',
      addedGames: 'Games added',
      finishesOverTime: 'Finishes over time',
      finishesOverTimeHint: 'Finished dates from your library, regardless of when the games were added.',
      backlogPressure: 'Backlog pressure',
      backlogPressureHint: 'A quick comparison of what is waiting, active, and finished.',
      journalActivity: 'Journal activity',
      journalActivityHint: 'Play logs written over time.',
      platformMix: 'Platform mix',
      platformMixHint: 'Your most-used platforms by game count.',
      noneYet: 'None yet',
    },
    home: {
      kicker: 'Home',
      activeGame: 'Active game',
      nowPlaying: 'Now playing',
      currentGameKicker: 'Current game',
      currentGameDetails: 'Mini overview',
      activeGames: 'Active games',
      activeGamesAria: 'Active games',
      paginationAria: 'Active game pagination',
      goToGame: 'Go to {title}',
      platformFree: 'Platform free',
      quickPlayLog: 'Quick play log',
      quickPlayLogPlaceholder: 'What just happened, what stood out, what did this session feel like?',
      addPlayLog: 'Add play log',
      pausedNudges: 'Paused, but not forgotten',
      pausedNotForgotten: 'Worth checking in',
      pausedDue: 'Nudged for {date}.',
      pausedDueNoDate: 'Ready when you are.',
      resumePausedGame: 'Resume',
      snoozePausedGame: 'Snooze 1 week',
      openFullGamePage: 'Full game page',
      recentMoments: 'Recent moments',
      whatJustHappened: 'What just happened',
      journeyKicker: 'Journey',
      journeyTitle: 'So far',
      timelineLogs: 'Notes',
      timelineLogCount: '{count} logs',
      timelineFirstNote: 'First note',
      timelineLatestNote: 'Latest note',
      timelineReviewWritten: 'Written',
      timelineReviewOpen: 'Open',
      noRecentThoughts: 'No recent thoughts yet',
      noRecentThoughtsBody: 'Add the first log and Home starts doing its job.',
      mioChoice: 'Mio-chan choice',
      whatToPlayNext: 'What should I play next?',
      editThisGame: 'Edit this game',
      recommendationBody: 'Mio looks at your shelf and picks a couple of games that might feel right today.',
      recommendBacklogGames: 'Recommend games',
      recommendAgain: 'Recommend again',
      recommendedFromBacklog: 'Mio thinks this could fit',
      openRecommendedGame: 'Full game page',
      recommendationReasonPriority: 'Marked {priority}',
      recommendationReasonTaste: 'Fits your {tag} shelf',
      recommendationReasonLongWaiting: 'Waiting about {months} months',
      recommendationReasonRediscovery: 'Mio dusted this one off',
      recommendationReasonReady: 'Ready when you are',
      backupReminderKicker: 'Local safety',
      backupReminderTitle: 'Time for a tiny safety backup',
      backupReminderBody: 'Your library lives on this device. Export a backup so it has a second home.',
      exportBackup: 'Export backup',
      backupReminderLater: 'Later',
      noCurrentGame: 'No current game yet',
      noCurrentGameBody:
        'Pick something from your backlog when you are ready to play.',
    },
    trophies: {
      panelKicker: 'Trophy cabinet',
      panelTitle: 'Little victories',
      cabinetTitle: 'Your trophy shelf',
      panelBody: '{earned} of {total} trophies unlocked.',
      panelEmpty: 'Trophies unlock as your journal grows.',
      openCabinet: 'Open cabinet',
      earnedStat: 'Earned',
      lockedStat: 'Locked',
      latestStat: 'Latest',
      completionStat: 'Completion',
      noneYet: 'None yet',
      lockedStatus: 'Not unlocked yet',
      notEarned: '',
      locked: 'Locked',
      unlockedTitle: 'Trophy unlocked',
      retroTitle: 'Your trophy cabinet caught up',
      retroBody: '{count} trophies were added from your existing journal.',
      close: 'Lovely',
      firstLog: {
        title: 'Journey Begins',
        description: 'Write your first play log.',
      },
      dearDiary: {
        title: 'Novelist',
        description: 'Write 10 play logs.',
      },
      deepDive: {
        title: 'Deep Dive',
        description: 'Write 10 logs for one game.',
      },
      firstFinish: {
        title: 'Credits Rolled',
        description: 'Finish your first game.',
      },
      creditsRolled: {
        title: 'Completionist',
        description: 'Finish 10 games.',
      },
      firstReview: {
        title: 'Reviewer',
        description: 'Write your first review.',
      },
      criticNotes: {
        title: 'Critic',
        description: 'Write 3 reviews.',
      },
      strongFeelings: {
        title: 'Masterpiece',
        description: 'Rate a game 9 or 10.',
      },
      shelfCurator: {
        title: 'Collector',
        description: 'Add 25 games to your library.',
      },
      bigShelf: {
        title: 'Curator',
        description: 'Add 50 games to your library.',
      },
    },
    library: {
      kicker: 'Library',
      title: 'Your whole shelf',
      yourGames: 'Your games',
      visibleOutOfTotal: '{visible} visible out of {total} total.',
      viewMode: 'Library view mode',
      listView: 'List',
      shelfView: 'Shelf',
      switchToListView: 'Switch to list view',
      switchToShelfView: 'Switch to shelf view',
      openShelfGame: 'Open {title}',
      searchPlaceholder: 'Search title, metadata, tag',
      statusFilter: 'Status filter',
      sort: 'Sort',
      filters: 'Filters',
      filtersCount: 'Filters {count}',
      ownershipFilter: 'Format filter',
      finishYearFilter: 'Finish year',
      anyFinishYear: 'Any finish year',
      finishedInYear: 'Finished in {year}',
      resetFilters: 'Reset filters',
      finishedOn: 'Finished {date}',
      editDetails: 'Edit details',
      noMatches: 'No matches right now',
      noMatchesBody:
        'Try a broader search or a different status filter, or add the next game calling your name.',
    },
    form: {
      edit: 'Edit',
      editGame: 'Edit game',
      updatingEntry: 'You are updating {title}.',
      updatingFallback: 'You are updating this entry.',
      newEntry: 'New entry',
      addEntryHelper: 'Add the next game calling your name.',
      title: 'Title',
      titlePlaceholder: 'Final Fantasy VII',
      wikidataSearching: 'Looking for title suggestions...',
      wikidataSuggestions: 'Title suggestions from Wikidata',
      wikidataFailed: 'Could not load title suggestions right now.',
      wikidataNoMatches: 'No likely game matches found. Try adjusting the title.',
      wikidataLinked: 'Metadata match selected. Choose another suggestion to change it.',
      findMetadata: 'Find metadata',
      metadataReviewTitle: 'Review suggested metadata',
      metadataReviewHint: 'Empty fields are selected automatically. Choose any existing values you want to replace.',
      metadataEmpty: 'Empty',
      metadataAddTags: 'Add {tags}',
      applyMetadata: 'Apply selected metadata',
      duplicateGameTitle: 'Already in library',
      duplicateGameBody: '“{title}” seems to be already in your library. Replaying? Add a new journey or deliberately create a separate game.',
      addJourneyToExisting: 'Add journey',
      createSeparateGame: 'Create separately',
      wikipediaCoverSearching: 'Looking for cover artwork...',
      wikipediaCoverSuggestion: 'Cover suggestion from Wikipedia',
      wikipediaCoverAlt: 'Suggested cover artwork for {title}',
      useWikipediaCover: 'Use this cover',
      status: 'Status',
      rating: 'Rating',
      ratingHint: 'Only for finished or abandoned runs. Rating must be between 1-10.',
      ratingPlaceholder: '1-10',
      playTime: 'Play time',
      playTimePlaceholder: '70 or 4.5',
      playTimeHint: 'Optional rough total play time in hours.',
      platform: 'Platform',
      platformPlaceholder: 'Pick one or type your own',
      platformHint: 'Choose a suggestion or add the system, storefront, or setup you use.',
      ownershipType: 'Format',
      ownershipTypeHint: 'Optional. Mark whether this copy is digital, physical, or both.',
      finishedOn: 'Finished on',
      finishedOnHint: 'Used for yearly wrap-ups and finished-by-year filtering.',
      pauseNudge: 'Nudge me',
      pauseNudgeHint: 'Home will surface paused games when this date arrives.',
      pauseNudgeNone: 'No nudge',
      pauseNudgeOneWeek: 'In 1 week',
      pauseNudgeTwoWeeks: 'In 2 weeks',
      pauseNudgeOneMonth: 'In 1 month',
      pauseNudgeCurrent: 'Keep {date}',
      tags: 'Tags',
      addOwnTag: 'Add your own tag',
      addTag: 'Add tag',
      tagsHint: 'Suggested tags are quick picks. You can still add your own.',
      moreDetails: 'More details',
      gameDetails: 'Game details',
      gameDetailsHint: 'Shared metadata that stays the same across every journey.',
      journeyDetails: 'Journey details',
      journeyDetailsHint: 'Your status, copy, progress, rating, and review for this journey.',
      coverUrl: 'Cover image URL',
      coverUrlPlaceholder: 'https://example.com/cover.webp',
      coverUrlHint:
        'Optional cover art URL.',
      releaseYear: 'Release year',
      releaseYearPlaceholder: '1997',
      releaseYearHint: 'Optional. Used for rediscovery and sorting later.',
      priority: 'Priority',
      priorityUnset: 'Not set',
      priorityHint: 'Optional personal intent for backlog rediscovery.',
      developer: 'Developer',
      developerPlaceholder: 'Square Enix',
      developerHint: 'Optional free text. This overrides enriched metadata.',
      publisher: 'Publisher',
      publisherPlaceholder: 'Nintendo',
      publisherHint: 'Optional free text. This overrides enriched metadata.',
      review: 'Review',
      reviewPlaceholder: 'our thoughts so far...',
      reviewHint: 'Your final take on the game.',
      playTimeMeta: 'Play time {hours} h',
      addedMeta: 'Added {date}',
      updatedMeta: 'Updated {date}',
      saveChanges: 'Save changes',
      addGame: 'Add game',
      cancel: 'Cancel',
      deleteGame: 'Delete game',
      cancelDelete: 'Cancel',
      clearFormFields: 'Clear form fields',
    },
    gameView: {
      kicker: 'Game',
      fallbackTitle: 'Game detail',
      lede: 'Full context for one game: review, play log, and the latest small thoughts in one place.',
      backToLibrary: 'Back to library',
      editGame: 'Edit game',
      loadingGame: 'Loading game...',
      gameNotFound: 'Game not found',
      detailsOnWay: 'The details are on the way.',
      gameMissing: 'That game is not in the local library anymore.',
    },
    detail: {
      kicker: 'Overview',
      goBack: 'Go back',
      created: 'Created {date}',
      lastUpdated: 'Last updated {date}',
      lastUpdatedShort: 'Updated',
      sessionNotes: 'Play logs',
      currentStatus: 'Current status',
      journeyNumber: 'Journey {number}',
      selectedJourney: 'Journey {number} · Selected',
      platform: 'Platform',
      ownershipType: 'Format',
      rating: 'Rating',
      tags: 'Tags',
      finished: 'Finished',
      playTime: 'Play time',
      lifetimePlayTime: 'Lifetime {hours} h',
      allJourneyLogs: 'All journeys',
      selectedJourneyLogs: 'Selected journey',
      deleteJourney: 'Delete journey',
      confirmDeleteJourney: 'Delete this Journey and all of its play logs? The Game and its other Journeys will stay.',
      creditsFull: 'Developed by {developers} · Published by {publishers}',
      creditsDevelopers: 'Developed by {developers}',
      creditsPublishers: 'Published by {publishers}',
      review: 'Review',
      reviewDraft: 'Review draft',
      anywhere: 'Anywhere',
      draftFromLogs: 'Draft from logs',
      redraftFromLogs: 'Redraft',
      draftingReview: 'Drafting...',
      localModelDownloading: 'Downloading model… {percent}%',
      localModelPreparing: 'Preparing on-device model… {percent}%',
      localModelWriting: 'Writing your draft on this device…',
      noReviewYet: 'No review yet. Let the play logs speak first, or ask Mio-chan for a draft.',
      useAsReview: 'Use as review',
      discardDraft: 'Discard draft',
      quickThought: 'Quick thought',
      quickThoughtPlaceholder: 'What just happened, what stood out, what did this session feel like?',
      copyReview: 'Copy review',
      copyJournal: 'Copy journal',
      exportJournal: 'Export .md',
      addLogEntry: 'Add log entry',
      editLog: 'Edit log entry',
      shareLog: 'Share log entry',
      shareLogTitle: 'Share this play log',
      shareLogNative: 'Share',
      shareLogCopy: 'Copy text',
      shareLogCancel: 'Cancel',
      shareLogCharacterCount: '{count} characters',
      shareLogUnavailable: 'Native sharing is unavailable in this browser. Copy the text instead.',
      saveLogEdit: 'Save',
      cancelLogEdit: 'Cancel',
      editedLog: 'Edited {date}',
      noLogs: 'No logs yet',
      noLogsBody: 'The first small thought is usually enough to make a game feel alive here.',
      selectGame: 'Select a game',
      selectGameBody: 'Choose a game from the library to start writing short play-session notes.',
      addTimePlaceholder: 'Hours',
      addTimeButton: 'Log time',
      startReplay: 'Start replay',
      replaySyncBlocked: 'Replays need MioServer 3. Disconnect sync to start one locally for now.',
    },
    editView: {
      add: 'Add',
      edit: 'Edit',
      addTitle: 'A new journey',
      editTitle: 'Shape the entry',
    },
    settings: {
      kicker: 'Settings',
      title: 'Preferences and backup',
      languageKicker: 'Language',
      languageTitle: 'Pick your interface language',
      languageHelper: 'MioLog can switch between English, German, and Japanese and remembers your choice locally.',
      languageLabel: 'App language',
      language: {
        en: 'English',
        de: 'Deutsch',
        ja: '日本語',
      },
      themeKicker: 'Theme',
      themeTitle: 'Choose MioLog’s mood',
      themeHelper:
        'Choose between dark moody journal, vibrant Mio-chan purple, icy-clean Polar, or Preem Neon.',
      themeLabel: 'App theme',
      theme: {
        journal: 'Midnight Journal',
        mio: 'Mio',
        polar: 'Polar',
        preemNeon: 'Preem Neon',
      },
      syncKicker: 'Sync',
      syncTitle: 'Connect to your backend',
      syncHelper:
        'Point MioLog at a backend you trust, then test the connection and sync your local library when you want.',
      autoSyncLabel: 'Auto sync when the app is active',
      syncUrlLabel: 'Backend URL',
      syncUrlPlaceholder: 'https://miolog.example.com',
      syncTokenLabel: 'Sync token',
      syncTokenPlaceholder: 'Paste your personal sync token',
      testConnection: 'Test connection',
      testingConnection: 'Testing...',
      syncNow: 'Sync now',
      syncingNow: 'Syncing...',
      syncConnectedAs: 'Connected as {name}.',
      syncCompletedNotice: 'Sync complete: {games} games and {logs} logs now match the backend.',
      lastSyncedAt: 'Last synced {date}.',
      lastSyncedNever: 'Not synced yet on this device.',
      lastSyncError: 'Last sync issue: {message}',
      shareKicker: 'Sharing',
      shareTitle: 'Play log sharing',
      shareHelper: 'Choose how individual play logs are wrapped when you share or copy them.',
      shareConfigure: 'Configure',
      shareDialogTitle: 'Customize play log sharing',
      shareTemplateLabel: 'Share template',
      shareTemplateHint: 'Available: {title}, {log}, {platform}, {status}, {hashtags}',
      shareHashtagsLabel: 'Hashtags',
      shareHashtagsHint: 'Optional. Include {hashtags} in the template to place them.',
      sharePreview: 'Example preview',
      shareCharacterCount: '{count} characters',
      shareExampleTitle: 'A game worth remembering',
      shareExampleLog: 'That small moment completely changed how I see the story.',
      shareExamplePlatform: 'Switch',
      shareReset: 'Reset default',
      shareCancel: 'Cancel',
      shareSave: 'Save',
      localAiKicker: 'On-device AI',
      localAiTitle: 'Draft reviews on this device',
      localAiHelper:
        'Turn your play logs into a review draft with a small AI model that runs entirely in your browser — nothing leaves your device. The model downloads once and is cached for offline use afterwards.',
      localAiEnableLabel: 'Enable on-device review drafts',
      localAiModelLabel: 'On-device model',
      localAiModelMeta: 'Larger models write better but take longer to download and need a more capable device.',
      localAiChecking: 'Checking download…',
      localAiNotCached: 'Not downloaded yet. Grab it on Wi-Fi, then draft anywhere — even fully offline.',
      localAiDownloadModel: 'Download model ({size})',
      localAiDownloading: 'Downloading model… {percent}%',
      localAiPreparing: 'Preparing model… {percent}%',
      localAiRemove: 'Remove download',
      localAiDownloadFailed: 'Download failed. Check your connection and try again.',
      localAiConfirmTitle: 'Download on-device model?',
      localAiConfirmBody:
        'This downloads about {size} once and keeps it cached for offline use. Best done on Wi-Fi.',
      localAiConfirmDownload: 'Download',
      localAiConfirmCancel: 'Cancel',
      localAiUnsupported:
        'This browser can’t run on-device AI — its WebGPU support is missing or too limited. Try a recent Chrome or Safari.',
      localAiLanguageUnavailable:
        'On-device review drafts aren’t available in your current app language yet.',
      localAiTier: {
        balanced: 'balanced',
        fast: 'fastest',
        quality: 'best quality',
      },
      backupKicker: 'Backup',
      backupTitle: 'Protect your local data',
      backupHelper: 'If you don\'t want to use the sync exporting JSON backups is your safety net.',
      backupReminderLabel: 'Remind me to export a backup every 30 days',
      backupReminderDisabledBySync: 'Backup reminders are off while sync is connected.',
      backupReminderLastExported: 'Last backup exported on {date}.',
      backupReminderNeverExported: 'No backup has been exported from this device yet.',
      importMode: 'Import mode',
      mergeMode: 'Merge into current data',
      replaceMode: 'Replace current data',
      replaceDisabledBySync: 'Replacement is unavailable while sync is connected. Disconnect sync first so replaced data cannot return on the next sync.',
      exportBackup: 'Export backup',
      importBackup: 'Import backup',
      replaceConfirm: 'Replace all current local data with this backup?',
      cancelImport: 'Cancel',
      replaceImport: 'Replace data',
      csvKicker: 'Library CSV',
      csvTitle: 'Import games from a spreadsheet',
      csvHelper:
        'Download the template and add your games. CSV imports one Game and its initial Journey per row; it never imports Journey history. Use JSON backup to move or restore all MioLog data.',
      csvRulesTitle: 'CSV import rules',
      csvRuleTitle: 'Only the title column and a title in each row are required. Other template columns are optional.',
      csvRuleBlank: 'Leave unused cells blank. Empty status becomes backlog.',
      csvRuleStatus:
        'Status accepts backlog, playing, ongoing, finished, paused, or abandoned. Casing does not matter.',
      csvRulePlayTime: 'playTimeHours accepts decimal values with "." or ",".',
      csvRuleFinishedDate: 'finishedDate is only used for finished games and must be YYYY-MM-DD.',
      csvRuleMioIdNew: 'Adding new games? Leave mioId blank.',
      csvRuleMioIdEdit: 'Bulk-editing this same library? Keep mioId. Journey fields update only the current Journey; previous Journeys stay untouched.',
      csvRuleBackup: 'Moving or restoring all MioLog data? Use JSON backup instead.',
      csvExportTemplate: 'Download template',
      csvExportLibrary: 'Export CSV',
      csvImport: 'Import CSV',
      csvTemplateExported: 'CSV template downloaded.',
      csvLibraryExported: 'Library CSV exported.',
      csvPreviewTitle: 'Preview CSV import',
      csvPreviewSummary: '{created} new, {updated} updated, {skipped} skipped.',
      csvPreviewIssueSummary: '{errors} errors and {warnings} warnings found. Valid rows can still be imported.',
      csvPreviewErrorsTitle: 'Errors: showing {shown} of {total}',
      csvPreviewWarningsTitle: 'Warnings: showing {shown} of {total}',
      csvPreviewDuplicateMessage:
        'Line {line}: "{title}" already exists with this platform. Export CSV to bulk-edit, or change title/platform to import separately.',
      csvConfirmImport: 'Import games',
      csvImportCompleted: 'CSV import complete: {created} new, {updated} updated, {skipped} skipped.',
      csvImportFailed: 'CSV import failed. Make sure the file uses MioLog’s CSV template.',
      version: 'MioLog v{version}',
      demoKicker: 'Demo',
      demoTitle: 'Sample data',
      demoHelper:
        'This demo uses a separate local sample library. Changes stay in this browser and can be reset at any time.',
      resetDemo: 'Reset demo data',
      demoNoSyncTitle: 'Sync is disabled in the demo.',
      demoNoSyncBody: 'Use the real MioLog app when you want your own persistent backlog and backend sync.',
    },
    feedback: {
      giveTitleFirst: 'Give the game a title first.',
      ratingInvalid: 'Rating needs to be a whole number from 1 to 10.',
      playTimeInvalid: 'Play time needs to be a positive number of hours.',
      gameUpdated: 'Game updated.',
      gameAdded: 'Game added to your backlog.',
      confirmDelete: 'Delete "{title}" and all of its logs?',
      gameDeleted: 'Game deleted.',
      journeyDeleted: 'Journey deleted.',
      logSaved: 'Log entry saved.',
      logUpdated: 'Log entry updated.',
      alreadyStatus: '{title} is already {status}.',
      movedToStatus: '{title} moved to {status}.',
      switchFailed: 'Could not switch {title} to {status}.',
      replayStarted: 'A new journey through {title} has begun.',
      journeyAdded: 'A new journey through {title} has been added.',
      replayStartFailed: 'Could not start a replay for {title}.',
      replaySyncBlocked: 'Disconnect sync before starting a replay. MioServer 2 cannot preserve multiple journeys.',
      pausedNudgeSnoozed: '{title} snoozed for a week.',
      pausedNudgeFailed: 'Could not update that paused nudge.',
      reviewCopied: 'Review copied to clipboard.',
      reviewCopyFailed: 'Could not copy the review.',
      journalCopied: 'Journal copied to clipboard.',
      journalCopyFailed: 'Could not copy the journal. Try exporting the Markdown file instead.',
      journalExported: 'Journal exported as Markdown.',
      playLogShared: 'Play log shared.',
      playLogCopied: 'Share text copied to clipboard.',
      playLogShareFailed: 'Could not share or copy this play log.',
      backupExported: 'Backup exported on {date}.',
      backupExportedNotice: 'Backup exported successfully on {date}.',
      backupRestored: 'Backup restored. {games} games and {logs} logs loaded.',
      backupMerged: 'Backup merged. {games} games and {logs} logs imported.',
      backupRestoredNotice: 'Backup restored: {games} games and {logs} logs loaded.',
      backupMergedNotice: 'Backup merged: {games} games and {logs} logs imported.',
      backupReplaceSyncBlocked: 'Disconnect sync before replacing local data.',
      importFailed: 'Import failed. Make sure the backup file is valid JSON from this app.',
      syncUrlMissing: 'Add the backend URL first.',
      syncTokenMissing: 'Paste your sync token first.',
      syncConnectionOk: 'Connection works. You are signed in as {name}.',
      syncConnectionFailed: 'Could not reach the sync backend.',
      syncCompleted: 'Sync complete. {games} games and {logs} logs are now aligned.',
      syncFailed: 'Sync failed. Please check your backend URL and sync token.',
      syncVersionBlocked: 'Sync is paused because MioServer sync API v3 is required.',
      timeAdded: '{hours} h logged for {title}.',
      timeAddFailed: 'Could not log time.',
      reviewDraftApplied: 'Review draft applied.',
      reviewDraftFailed: 'Could not draft a review right now.',
      localModelStorageFull: 'Not enough storage to download the model. Free up some space and try again.',
      localModelCrashed: 'On-device drafting ran out of memory and reloaded the page. Pick a smaller model in Settings, or draft on a computer.',
      demoReset: 'Demo data reset.',
    },
    tag: {
      RPG: 'RPG',
      JRPG: 'JRPG',
      Action: 'Action',
      Adventure: 'Adventure',
      Horror: 'Horror',
      Soulslike: 'Soulslike',
      Cozy: 'Cozy',
      Narrative: 'Narrative',
      Strategy: 'Strategy',
      Tactical: 'Tactical',
      Roguelike: 'Roguelike',
      Metroidvania: 'Metroidvania',
      Puzzle: 'Puzzle',
      Simulation: 'Simulation',
      Fighting: 'Fighting',
      Platformer: 'Platformer',
      Shooter: 'Shooter',
      Racing: 'Racing',
      Sports: 'Sports',
      'Visual Novel': 'Visual Novel',
      Stealth: 'Stealth',
      'Co-op': 'Co-op',
      Indie: 'Indie',
    },
    wrapped: {
      replay: 'Replay',
      replayTitle: '{title} · Journey {number}',
      kicker: 'Wrapped',
      yearInReview: 'Year in review',
      title: '{year} in games',
      backToHome: 'Home',
      noFinishedGames: 'No finished games in {year}.',
      gamesFinished: 'Games finished',
      totalPlayTime: 'Total play time',
      avgRating: 'Avg. rating',
      topPlatform: 'Top platform',
      topGenres: 'Top genres',
      firstFinished: 'First finished',
      lastFinished: 'Last finished',
      homePanelKicker: 'Year in review',
      homePanelTitle: 'Gaming Wrapped',
      viewWrapped: 'View {year}',
      homePanelPreview: '{count} games · ~{hours} h',
      homePanelPreviewNoHours: '{count} games',
      shareCard: 'Share {year}',
      sharingCard: 'Generating...',
    },
} as const

/**
 * Type-safe message key union. Ensures all keys are valid at compile time.
 * Example valid keys: 'nav.home', 'app.title', 'status.playing', etc.
 * Exported so other files can use it for type-safe translations.
 */
export type MessageKey = NestedKeyOf<typeof en>

// Same nested shape as the English source, but with every leaf widened from its
// literal (e.g. 'Home') to `string`. Keys are optional because a locale may omit
// translations and fall back to English at runtime (see `resolveKey`), matching
// the behaviour from when all locales lived in one object literal.
type Localized<T> = {
  readonly [K in keyof T]?: T[K] extends string ? string : Localized<T[K]>
}
export type LocaleMessages = Localized<typeof en>

// English is always present: it is the type source and the fallback for any key
// a translation is missing. Other locales ship as separate chunks that are
// loaded on demand (and awaited at startup for the active language in main.ts),
// keeping unused locales out of the initial bundle. `shallowReactive` makes the
// per-locale slot reactive so views re-render once a locale finishes loading,
// while the message trees themselves stay plain (fast) objects.
const loadedLocales = shallowReactive(
  Object.fromEntries(
    APP_LANGUAGES.map((language) => [language, language === 'en' ? en : undefined]),
  ) as Record<AppLanguage, LocaleMessages | undefined>,
)

const localeLoaders: Partial<Record<AppLanguage, () => Promise<{ default: LocaleMessages }>>> = {
  de: () => import('./locales/de'),
  ja: () => import('./locales/ja'),
}

const localeLoads = new Map<AppLanguage, Promise<void>>()

/**
 * Load a locale's messages on demand. Resolves immediately for already-loaded
 * locales (en is always loaded). Concurrent calls share one import.
 */
export function ensureLocaleLoaded(language: AppLanguage): Promise<void> {
  if (loadedLocales[language]) {
    return Promise.resolve()
  }

  const existing = localeLoads.get(language)

  if (existing) {
    return existing
  }

  const loader = localeLoaders[language]

  if (!loader) {
    return Promise.resolve()
  }

  const load = loader().then((module) => {
    loadedLocales[language] = module.default
  })
  localeLoads.set(language, load)

  return load
}

function resolveKey(language: AppLanguage, key: string): string {
  const path = key.split('.')
  let cursor: unknown = loadedLocales[language]

  for (const segment of path) {
    if (!cursor || typeof cursor !== 'object' || !(segment in cursor)) {
      cursor = undefined
      break
    }

    cursor = (cursor as Record<string, unknown>)[segment]
  }

  if (typeof cursor === 'string') {
    return cursor
  }

  if (language !== 'en') {
    return resolveKey('en', key)
  }

  return key
}

function interpolate(template: string, params?: Record<string, string | number>) {
  if (!params) {
    return template
  }

  return template.replace(/\{(\w+)\}/g, (_, token) => String(params[token] ?? ''))
}

export function translate(
  language: AppLanguage,
  key: MessageKey,
  params?: Record<string, string | number>,
) {
  // Trigger a background load the first time a not-yet-loaded locale is used so
  // runtime language switches fill in; until it resolves we serve the English
  // fallback and the reactive slot re-renders once the chunk arrives.
  if (!loadedLocales[language]) {
    void ensureLocaleLoaded(language)
  }

  return interpolate(resolveKey(language, key), params)
}

export function getStatusLabel(language: AppLanguage, status: GameDisplayStatus | 'all') {
  return translate(language, `status.${status}`)
}

export function getSortLabel(language: AppLanguage, option: GameSortOption, context?: 'finished') {
  if (context === 'finished' && option === 'created-desc') {
    return translate(language, 'sort.finished-desc')
  }

  if (context === 'finished' && option === 'created-asc') {
    return translate(language, 'sort.finished-asc')
  }

  return translate(language, `sort.${option}`)
}

export function getOwnershipLabel(
  language: AppLanguage,
  ownership: GameOwnershipFilter | GameOwnershipType | null,
) {
  return translate(language, `ownership.${ownership ?? 'unset'}`)
}

export function getTagLabel(language: AppLanguage, tag: string) {
  return translate(language, `tag.${tag}` as MessageKey)
}

export function useI18n() {
  const { setLanguage, settings } = useSettings()

  function t(key: MessageKey, params?: Record<string, string | number>) {
    return translate(settings.language, key, params)
  }

  function statusLabel(status: GameDisplayStatus | 'all') {
    return getStatusLabel(settings.language, status)
  }

  function sortLabel(option: GameSortOption, context?: 'finished') {
    return getSortLabel(settings.language, option, context)
  }

  function ownershipLabel(ownership: GameOwnershipFilter | GameOwnershipType | null) {
    return getOwnershipLabel(settings.language, ownership)
  }

  function tagLabel(tag: string) {
    return getTagLabel(settings.language, tag)
  }

  return {
    language: computed(() => settings.language),
    ownershipLabel,
    setLanguage,
    sortLabel,
    statusLabel,
    t,
    tagLabel,
  }
}
