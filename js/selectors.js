export const SEL = {
  // App shell
  authOverlay:      'auth-overlay',
  authEmailForm:    'auth-email-form',
  authOtpForm:      'auth-otp-form',
  authEmailInput:   'auth-email-input',
  authEmailDisplay: 'auth-email-display',
  authOtpInput:     'auth-otp-input',
  authError:        'auth-error',
  signoutBtn:       'signout-btn',
  panelToggle:      'panel-toggle',
  leftPanel:        'left-panel',
  offlineBanner:    'offline-banner',
  onlineDot:        'online-dot',

  // Navigation tabs
  tabTrips:  'tab-trips',
  tabBudget: 'tab-budget',
  tabPrefs:  'tab-prefs',
  tabData:   'tab-data',

  // Trip selector
  tripSelectorBtn:   'trip-selector-btn',
  tripSelectorList:  'trip-selector-list',
  tripSelectorLabel: 'trip-selector-label',

  // Content panels
  timelineContent: 'timeline-content',
  budgetContent:   'budget-content',
  panelPrefs:      'panel-prefs',
  prefsContent:    'prefs-content',
  dataContent:     'data-content',

  // Map
  map: 'map',

  // Trip Modal
  tripModal:      'trip-modal',
  tripModalClose: 'trip-modal-close',
  tmTitle:    'tm-title',
  tmStart:    'tm-start',
  tmEnd:      'tm-end',
  tmStatus:   'tm-status',
  tmBudget:   'tm-budget',
  tmCurrency: 'tm-currency',
  tmNotes:    'tm-notes',
  tmSave:     'tm-save',
  tmCancel:   'tm-cancel',
  tmDelete:   'tm-delete',

  // Segment Modal
  segModal:      'seg-modal',
  segModalClose: 'seg-modal-close',
  smName:    'sm-name',
  smStart:   'sm-start',
  smEnd:     'sm-end',
  smColors:  'sm-colors',
  smSave:    'sm-save',
  smCancel:  'sm-cancel',
  smDelete:  'sm-delete',

  // Day Modal
  dayModal:       'day-modal',
  dayModalClose:  'day-modal-close',
  dmDate:         'dm-date',
  dmType:         'dm-type',
  dmTitle:        'dm-title',
  dmNote:         'dm-note',
  dmLat:          'dm-lat',
  dmLng:          'dm-lng',
  dmPlaceSearch:  'dm-place-search',
  dmPlaceResults: 'dm-place-results',
  dmSave:         'dm-save',
  dmCancel:       'dm-cancel',
  dmDelete:       'dm-delete',
  dmTMode:        'dm-t-mode',
  dmTFrom:        'dm-t-from',
  dmTTo:          'dm-t-to',
  dmTCarrier:     'dm-t-carrier',
  dmTDuration:    'dm-t-duration',

  // Confirm Modal
  confirmModal:   'confirm-modal',
  confirmTitle:   'confirm-title',
  confirmMessage: 'confirm-message',
  confirmOk:      'confirm-ok',
  confirmCancel:  'confirm-cancel',

  // Expense Form
  efDate:          'ef-date',
  efCategory:      'ef-category',
  efAmount:        'ef-amount',
  efCurrency:      'ef-currency',
  efSegment:       'ef-segment',
  efNote:          'ef-note',
  efSave:          'ef-save',
  efCancel:        'ef-cancel',
  expenseFormWrap: 'expense-form-wrap',

  // Checklist
  todoAddBtn:      'todo-add-btn',
  todoAddInput:    'todo-add-input',
  packingAddBtn:   'packing-add-btn',
  packingAddInput: 'packing-add-input',
  packingCatInput: 'packing-cat-input',

  // Data panel
  importTripsFile: 'import-trips-file',
  importPrefsFile: 'import-prefs-file',
  exportJsonBtn:   'export-json-btn',
  exportExcelBtn:  'export-excel-btn',
  shareBtn:        'share-btn',
  shareResult:     'share-result',
  shareUrl:        'share-url',
  copyShareBtn:    'copy-share-btn',
  ideaAddBtn:      'idea-add-btn',
  ideaAddInput:    'idea-add-input',
  ideaNotesInput:  'idea-notes-input',

  // Prefs Edit
  peStyle:     'pe-style',
  peBudget:    'pe-budget',
  pePace:      'pe-pace',
  peCompanion: 'pe-companion',
  peLangWrap:  'pe-lang-wrap',
  peIntWrap:   'pe-int-wrap',
  peBlList:    'pe-bl-list',
  peBlAdd:     'pe-bl-add',
  peBlForm:    'pe-bl-form',
  peBlDest:    'pe-bl-dest',
  peBlNotes:   'pe-bl-notes',
  peBlOk:      'pe-bl-ok',
  peBlCx:      'pe-bl-cx',
  peCancel:    'pe-cancel',
  peSave:      'pe-save',

  // IDs rendered dynamically by uiRenderer.js（event delegation & tests 用）
  addTripBtn:    'add-trip-btn',
  tripEditBtn:   'trip-edit-btn',
  addSegBtn:     'add-seg-btn',
  addExpenseBtn: 'add-expense-btn',
};

// CSS selector 版（Playwright / querySelector 用，自動加 # 前綴）
export const CSEL = {
  ...Object.fromEntries(Object.entries(SEL).map(([k, v]) => [k, '#' + v])),
  // Compound selectors（不能靠 # 前綴自動產生）
  dmPlaceResultsLi:     `#${SEL.dmPlaceResults} li`,
  tripSelectorListItem: `#${SEL.tripSelectorList} li`,
};
